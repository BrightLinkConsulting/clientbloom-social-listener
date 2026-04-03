"""
agent.py — Main orchestrator for the ClientBloom Social Listener.

Run order per execution:
  1. Load config + credentials
  2. Fetch existing Post IDs from Airtable (dedup baseline)
  3. Trigger LinkedIn keyword scraping via Apify
  4. Trigger Facebook group scraping via Apify (one batch, all groups)
  5. Normalize raw results into standard post format
  6. Deduplicate against existing IDs
  7. Score all new posts with Claude (one batched API call)
  8. Filter by minimum score
  9. Save qualifying posts to Airtable (batched writes)
 10. Log run summary

The morning digest is a separate run triggered by the schedule.
"""

import os
import sys
import logging
import yaml
from datetime import datetime, timezone
from dotenv import load_dotenv

import apify_client
import scorer
import storage

# ---- Logging setup ----
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("agent")


def load_config(config_path: str = "config.yaml") -> dict:
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


def fetch_sources_from_airtable(airtable_token: str, base_id: str) -> dict:
    """
    Fetch active Facebook groups and LinkedIn search terms from the Airtable Sources table.
    Returns a dict with keys 'facebook_groups' and 'linkedin_search_terms'.
    Falls back to empty lists if the table doesn't exist or the fetch fails.
    """
    import requests as _requests

    url = f"https://api.airtable.com/v0/{base_id}/Sources"
    headers = {"Authorization": f"Bearer {airtable_token}"}

    try:
        all_records = []
        params = {"filterByFormula": "{Active}=1", "pageSize": 100}
        while True:
            resp = _requests.get(url, headers=headers, params=params, timeout=15)
            if resp.status_code == 404:
                logger.warning("Sources table not found in Airtable — falling back to config.yaml sources")
                return {}
            resp.raise_for_status()
            data = resp.json()
            all_records.extend(data.get("records", []))
            offset = data.get("offset")
            if not offset:
                break
            params["offset"] = offset

        facebook_groups = []
        linkedin_terms = []

        for r in all_records:
            f = r.get("fields", {})
            src_type = f.get("Type", "")
            if src_type == "facebook_group":
                facebook_groups.append({
                    "name": f.get("Name", ""),
                    "url": f.get("Value", ""),
                    "priority": f.get("Priority", "medium"),
                })
            elif src_type == "linkedin_term":
                linkedin_terms.append(f.get("Value", ""))

        logger.info(f"Loaded {len(facebook_groups)} Facebook groups and {len(linkedin_terms)} LinkedIn terms from Airtable Sources")
        return {
            "facebook_groups": facebook_groups,
            "linkedin_search_terms": [t for t in linkedin_terms if t],
        }

    except Exception as e:
        logger.warning(f"Could not load Sources from Airtable ({e}) — falling back to config.yaml sources")
        return {}


def normalize_linkedin_post(raw: dict) -> dict:
    """
    Normalize a LinkedIn post from Apify's output schema into our standard format.
    Handles both harvestapi (camelCase) and apimaestro (snake_case) field names.
    apimaestro fields: activity_id, post_url, text, full_urn, author.name,
                       author.profile_url, author.headline
    """
    text = (
        raw.get("text") or
        raw.get("description") or
        raw.get("content") or
        raw.get("commentary") or ""
    )
    # 'content' on apimaestro is a nested dict (linked content preview) — skip it if so
    if isinstance(text, dict):
        text = ""
    text = str(text).strip()

    post_url = (
        raw.get("post_url") or        # apimaestro (snake_case)
        raw.get("url") or
        raw.get("postUrl") or
        raw.get("shareUrl") or ""
    )

    post_id = (
        raw.get("activity_id") or     # apimaestro
        raw.get("full_urn") or        # apimaestro fallback
        raw.get("id") or
        raw.get("postId") or
        raw.get("urn") or
        post_url
    )

    author = raw.get("author") or {}
    author_name = (
        raw.get("authorName") or
        (author.get("name") if isinstance(author, dict) else "") or
        "Unknown"
    )
    author_url = (
        raw.get("authorUrl") or
        (author.get("profile_url") if isinstance(author, dict) else "") or  # apimaestro
        (author.get("profileUrl") if isinstance(author, dict) else "") or   # harvestapi
        ""
    )

    return {
        "post_id": str(post_id),
        "platform": "LinkedIn",
        "group_name": raw.get("groupName") or raw.get("companyName") or "LinkedIn Feed",
        "author_name": author_name,
        "author_profile_url": author_url,
        "post_text": text[:2000],
        "post_url": post_url,
        "keywords_matched": "",       # filled during scoring/filtering
        "relevance_score": 0,
        "captured_at": datetime.now(timezone.utc).isoformat()
    }


def normalize_facebook_post(raw: dict, group_name: str = "") -> dict:
    """
    Normalize a Facebook post from Apify's output schema.
    Field names confirmed from actual apify/facebook-groups-scraper output:
    text, url, facebookUrl (group URL), id, legacyId, user (object with id/name)
    """
    # Skip error items returned by Apify (private groups etc.)
    if raw.get("error") or raw.get("errorDescription"):
        return None

    text = (raw.get("text") or "").strip()

    post_url = raw.get("url") or raw.get("postUrl") or ""

    post_id = (
        raw.get("id") or
        raw.get("legacyId") or
        raw.get("postId") or
        post_url
    )

    user = raw.get("user") or {}
    author_name = (
        (user.get("name") if isinstance(user, dict) else None) or
        raw.get("authorName") or
        "Unknown"
    )
    author_url = (
        (user.get("url") if isinstance(user, dict) else None) or
        raw.get("authorUrl") or ""
    )

    # facebookUrl contains the group URL — use for group name lookup
    source_url = raw.get("facebookUrl") or raw.get("groupUrl") or ""

    return {
        "post_id": str(post_id),
        "platform": "Facebook",
        "group_name": raw.get("groupName") or group_name or "Facebook Group",
        "author_name": author_name,
        "author_profile_url": author_url,
        "post_text": text[:2000],
        "post_url": post_url,
        "source_url": source_url,   # used internally for group name matching
        "keywords_matched": "",
        "relevance_score": 0,
        "captured_at": datetime.now(timezone.utc).isoformat()
    }


def tag_keywords_matched(post: dict, keyword_lists: dict) -> dict:
    """Add the 'keywords_matched' field by scanning post text."""
    text = post.get("post_text", "").lower()
    matched = []
    for category_keywords in keyword_lists.values():
        for kw in category_keywords:
            if kw.lower() in text and kw not in matched:
                matched.append(kw)
    post["keywords_matched"] = ", ".join(matched[:10])  # cap at 10
    return post


def run_scraping_cycle(config: dict) -> dict:
    """
    Execute one full scraping cycle. Returns a summary dict.
    Called every 3 hours by the scheduler.
    """
    start_time = datetime.now(timezone.utc)
    logger.info("=" * 60)
    logger.info(f"Starting scraping cycle at {start_time.isoformat()}")
    logger.info("=" * 60)

    posts_table = config["airtable"]["posts_table"]
    apify_cfg = config["apify"]
    keywords = config["keywords"]
    min_score = config.get("scoring", {}).get("min_score_to_save", 2)

    summary = {
        "started_at": start_time.isoformat(),
        "linkedin_raw": 0,
        "facebook_raw": 0,
        "after_dedup": 0,
        "after_scoring": 0,
        "saved": 0,
        "errors": []
    }

    # Step 1: Fetch existing Post IDs for deduplication
    try:
        existing_ids = storage.fetch_all_post_ids(posts_table)
    except Exception as e:
        logger.error(f"Failed to fetch existing IDs from Airtable: {e}")
        summary["errors"].append(f"Airtable read failed: {str(e)}")
        return summary

    all_new_posts = []

    # Step 2: LinkedIn scraping
    # The apimaestro actor takes one searchQuery at a time, so we loop over terms.
    # Cap at MAX_LINKEDIN_TERMS per run to keep Apify costs predictable.
    MAX_LINKEDIN_TERMS = 4
    try:
        search_terms = config.get("linkedin_search_terms", [])[:MAX_LINKEDIN_TERMS]
        max_per_term = apify_cfg.get("max_results_linkedin", 50)
        all_raw_linkedin = []

        for term in search_terms:
            logger.info(f"LinkedIn scraping: '{term}'...")
            try:
                linkedin_input = apify_client.build_linkedin_input(
                    search_query=term,
                    max_results=max_per_term
                )
                raw_posts = apify_client.run_actor_and_fetch(
                    actor_id=apify_cfg["linkedin_actor"],
                    input_data=linkedin_input,
                    poll_interval=apify_cfg.get("poll_interval_seconds", 30),
                    max_attempts=apify_cfg.get("max_poll_attempts", 20)
                )
                logger.info(f"LinkedIn '{term}': {len(raw_posts)} posts")
                all_raw_linkedin.extend(raw_posts)
            except Exception as term_err:
                logger.warning(f"LinkedIn term '{term}' failed: {term_err}")

        summary["linkedin_raw"] = len(all_raw_linkedin)
        logger.info(f"LinkedIn total: {len(all_raw_linkedin)} raw posts across {len(search_terms)} terms")

        for raw in all_raw_linkedin:
            post = normalize_linkedin_post(raw)
            if post["post_text"] and len(post["post_text"]) >= 50:
                post = tag_keywords_matched(post, keywords)
                if post["keywords_matched"]:  # only score posts with at least one keyword hit
                    all_new_posts.append(post)

    except Exception as e:
        logger.error(f"LinkedIn scraping failed: {e}")
        summary["errors"].append(f"LinkedIn: {str(e)}")

    # Step 3: Facebook scraping
    try:
        logger.info("Starting Facebook scraping...")
        fb_groups = config.get("facebook_groups", [])
        active_groups = [g for g in fb_groups]

        if active_groups:
            group_urls = [g["url"] for g in active_groups]
            group_name_map = {g["url"]: g["name"] for g in active_groups}

            facebook_input = apify_client.build_facebook_input(
                group_urls=group_urls,
                max_posts=apify_cfg.get("max_posts_per_facebook_group", 30)
            )
            raw_facebook = apify_client.run_actor_and_fetch(
                actor_id=apify_cfg["facebook_actor"],
                input_data=facebook_input,
                poll_interval=apify_cfg.get("poll_interval_seconds", 30),
                max_attempts=apify_cfg.get("max_poll_attempts", 20)
            )
            summary["facebook_raw"] = len(raw_facebook)
            logger.info(f"Facebook: {len(raw_facebook)} raw posts returned")

            for raw in raw_facebook:
                post = normalize_facebook_post(raw, group_name="Facebook Group")
                if post is None:
                    continue  # skip error items
                # Use facebookUrl (group URL) to resolve human-readable group name
                source_url = post.pop("source_url", "")
                resolved_name = group_name_map.get(source_url, "")
                if resolved_name:
                    post["group_name"] = resolved_name
                if post["post_text"] and len(post["post_text"]) >= 50:
                    post = tag_keywords_matched(post, keywords)
                    if post["keywords_matched"]:  # only score posts with at least one keyword hit
                        all_new_posts.append(post)

    except Exception as e:
        logger.error(f"Facebook scraping failed: {e}")
        summary["errors"].append(f"Facebook: {str(e)}")

    if not all_new_posts:
        logger.info("No posts retrieved from either platform.")
        return summary

    # Step 4: Deduplicate
    new_posts = storage.deduplicate(all_new_posts, existing_ids)
    summary["after_dedup"] = len(new_posts)

    if not new_posts:
        logger.info("All posts were duplicates. Nothing to save.")
        return summary

    # Step 5: Score with Claude (one batch call)
    try:
        scored_posts = scorer.score_posts_batch(new_posts)
        qualifying = scorer.filter_by_min_score(scored_posts, min_score=min_score)
        summary["after_scoring"] = len(qualifying)
        logger.info(f"Scoring: {len(new_posts)} posts → {len(qualifying)} qualify (score >= {min_score})")
    except Exception as e:
        logger.error(f"Scoring failed: {e}")
        summary["errors"].append(f"Scoring: {str(e)}")
        # Save without scores rather than lose the data
        qualifying = new_posts

    # Step 6: Save to Airtable
    try:
        saved = storage.batch_save_posts(qualifying, posts_table)
        summary["saved"] = saved
    except Exception as e:
        logger.error(f"Airtable save failed: {e}")
        summary["errors"].append(f"Airtable write: {str(e)}")

    duration = (datetime.now(timezone.utc) - start_time).total_seconds()
    logger.info(f"Cycle complete in {duration:.0f}s — saved {summary['saved']} new posts")
    logger.info(f"Summary: {summary}")

    return summary


def run_morning_digest(config: dict) -> None:
    """
    Fetch yesterday's top posts and send the Slack digest.
    Called once per day at 7 AM Pacific.
    """
    import notifier

    logger.info("Running morning digest...")

    slack_cfg = config["slack"]
    posts_table = config["airtable"]["posts_table"]
    min_score = slack_cfg.get("min_score_for_digest", 4)

    posts = storage.fetch_posts_for_digest(
        posts_table=posts_table,
        since_hours=24,
        min_score=min_score
    )

    airtable_base_url = os.getenv("AIRTABLE_BASE_URL", "")

    payload = notifier.build_digest_message(
        posts=posts,
        channel_id=slack_cfg["channel_id"],
        airtable_base_url=airtable_base_url
    )

    success = notifier.send_slack_message(payload)
    if success:
        logger.info(f"Morning digest sent with {len(posts)} posts")
    else:
        logger.error("Failed to send morning digest")


if __name__ == "__main__":
    # Explicitly load .env values into os.environ (handles long/special keys dotenv misses)
    from dotenv import dotenv_values
    for k, v in dotenv_values(".env").items():
        if v:
            os.environ[k] = v
    config = load_config()

    # Override facebook_groups and linkedin_search_terms from Airtable Sources table
    # This lets users add/remove groups from the dashboard without touching config.yaml
    airtable_token = os.environ.get("AIRTABLE_API_TOKEN", "")
    airtable_base_id = os.environ.get("AIRTABLE_BASE_ID", "")
    if airtable_token and airtable_base_id:
        sources = fetch_sources_from_airtable(airtable_token, airtable_base_id)
        if sources.get("facebook_groups"):
            config["facebook_groups"] = sources["facebook_groups"]
            logger.info(f"Using {len(config['facebook_groups'])} Facebook groups from Airtable")
        if sources.get("linkedin_search_terms"):
            config["linkedin_search_terms"] = sources["linkedin_search_terms"]
            logger.info(f"Using {len(config['linkedin_search_terms'])} LinkedIn terms from Airtable")

    # Determine run mode from CLI arg
    mode = sys.argv[1] if len(sys.argv) > 1 else "scrape"

    if mode == "scrape":
        summary = run_scraping_cycle(config)
        if summary.get("errors"):
            logger.warning(f"Completed with {len(summary['errors'])} error(s): {summary['errors']}")
        sys.exit(0 if not summary.get("errors") else 1)

    elif mode == "digest":
        run_morning_digest(config)
        sys.exit(0)

    else:
        print(f"Unknown mode: {mode}. Use 'scrape' or 'digest'")
        sys.exit(1)
