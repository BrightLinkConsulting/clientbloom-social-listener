"""
agent.py — Main orchestrator for the ClientBloom Social Listener.

Run order per execution:
  1. Load config + credentials
  2. Fetch existing Post IDs from Airtable (dedup baseline)
  3. LinkedIn ICP mode: fetch ICP profiles → get their recent posts → score for engagement opportunity
  4. LinkedIn keyword mode: keyword search posts (legacy / secondary)
  5. Facebook group scraping via Apify (one batch, all groups)
  6. Normalize raw results into standard post format
  7. Deduplicate against existing IDs
  8. Score all new posts with Claude (batched API calls)
  9. Filter by minimum score
 10. Save qualifying posts to Airtable (batched writes)
 11. Log run summary

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


def fetch_linkedin_icps_from_airtable(airtable_token: str, base_id: str) -> list:
    """
    Fetch all active LinkedIn ICP profiles from the 'LinkedIn ICPs' Airtable table.
    Returns a list of dicts with keys: id, name, profile_url, job_title, company, industry.
    """
    import requests as _requests
    url = f"https://api.airtable.com/v0/{base_id}/LinkedIn%20ICPs"
    headers = {"Authorization": f"Bearer {airtable_token}"}
    try:
        profiles = []
        params = {"filterByFormula": "{Active}=1", "pageSize": 100}
        while True:
            resp = _requests.get(url, headers=headers, params=params, timeout=15)
            if resp.status_code == 404:
                logger.warning("LinkedIn ICPs table not found — skipping ICP scraping")
                return []
            resp.raise_for_status()
            data = resp.json()
            for r in data.get("records", []):
                f = r.get("fields", {})
                profile_url = f.get("Profile URL", "").strip()
                if profile_url:
                    profiles.append({
                        "id": r["id"],
                        "name": f.get("Name", ""),
                        "profile_url": profile_url,
                        "job_title": f.get("Job Title", ""),
                        "company": f.get("Company", ""),
                        "industry": f.get("Industry", ""),
                    })
            offset = data.get("offset")
            if not offset:
                break
            params["offset"] = offset
        return profiles
    except Exception as e:
        logger.warning(f"Could not fetch LinkedIn ICPs: {e}")
        return []


def normalize_linkedin_profile_post(raw: dict, icp_profile: dict) -> dict:
    """
    Normalize a post from harvestapi/linkedin-profile-posts.
    Fields: content (text), linkedinUrl (post URL), id, author.name,
            author.info (headline), author.linkedinUrl, postedAt.date,
            socialContent.shareUrl (canonical share URL).

    icp_profile: the ICP record from Airtable (name, job_title, company, profile_url).
    We store ICP context in group_name so Claude can use it for scoring.
    """
    text = raw.get("content", "")
    if isinstance(text, dict):
        text = ""
    text = str(text).strip()

    # Prefer the canonical shareUrl over the linkedinUrl (cleaner URL)
    social = raw.get("socialContent") or {}
    post_url = (
        social.get("shareUrl") or
        raw.get("linkedinUrl") or
        raw.get("url") or ""
    )

    post_id = str(raw.get("id") or raw.get("entityId") or post_url)

    author = raw.get("author") or {}
    author_name = author.get("name") or icp_profile.get("name") or "Unknown"
    author_headline = author.get("info") or ""   # job title/headline from LinkedIn
    author_url = (
        author.get("linkedinUrl") or
        icp_profile.get("profile_url") or ""
    )

    # Pack ICP context into group_name — shown in dashboard and passed to scorer
    icp_title = icp_profile.get("job_title") or author_headline
    icp_company = icp_profile.get("company") or ""
    icp_label = f"{icp_title} @ {icp_company}" if icp_company else icp_title
    group_name = f"LinkedIn ICP: {icp_label}" if icp_label else "LinkedIn ICP"

    return {
        "post_id": f"li_icp_{post_id}",   # prefix prevents collision with search posts
        "platform": "LinkedIn",
        "group_name": group_name,
        "author_name": author_name,
        "author_profile_url": author_url,
        "post_text": text[:2000],
        "post_url": post_url,
        "keywords_matched": "",
        "relevance_score": 0,
        "captured_at": datetime.now(timezone.utc).isoformat(),
        # Extra ICP context — used by ICP scorer, not stored directly
        "_icp_name": icp_profile.get("name", ""),
        "_icp_title": icp_title,
        "_icp_company": icp_company,
        "_author_headline": author_headline,
    }


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
        "linkedin_icp_raw": 0,
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
    icp_posts_for_scoring = []   # scored separately with ICP prompt

    # Step 2a: LinkedIn ICP profile monitoring
    try:
        airtable_token = os.getenv("AIRTABLE_API_TOKEN")
        airtable_base  = os.getenv("AIRTABLE_BASE_ID")
        icp_profiles = fetch_linkedin_icps_from_airtable(airtable_token, airtable_base)

        if icp_profiles:
            max_icp_profiles = apify_cfg.get("max_icp_profiles_per_cycle", 50)
            profiles_this_cycle = icp_profiles[:max_icp_profiles]
            profile_urls = [p["profile_url"] for p in profiles_this_cycle]
            profile_map  = {p["profile_url"]: p for p in profiles_this_cycle}

            logger.info(f"LinkedIn ICP: scraping {len(profiles_this_cycle)} profiles...")
            icp_input = apify_client.build_linkedin_profile_input(
                profile_urls=profile_urls,
                max_posts=apify_cfg.get("max_posts_per_icp_profile", 10)
            )
            raw_icp_posts = apify_client.run_actor_and_fetch(
                actor_id="harvestapi/linkedin-profile-posts",
                input_data=icp_input,
                poll_interval=apify_cfg.get("poll_interval_seconds", 30),
                max_attempts=apify_cfg.get("max_poll_attempts", 20)
            )
            logger.info(f"LinkedIn ICP: {len(raw_icp_posts)} raw posts returned")
            summary["linkedin_icp_raw"] = len(raw_icp_posts)

            for raw in raw_icp_posts:
                # Match post back to the ICP profile that was queried
                queried_url = raw.get("query", "")
                # Normalize queried URL to match our stored format
                import re as _re
                match = _re.search(r'linkedin\.com/in/([^/?&\s]+)', queried_url)
                slug = match.group(1) if match else ""
                icp_profile = next(
                    (p for p in profiles_this_cycle if slug and slug in p["profile_url"]),
                    profiles_this_cycle[0] if profiles_this_cycle else {}
                )
                post = normalize_linkedin_profile_post(raw, icp_profile)
                if post["post_text"] and len(post["post_text"]) >= 30:
                    icp_posts_for_scoring.append(post)

            logger.info(f"LinkedIn ICP: {len(icp_posts_for_scoring)} posts with content")
        else:
            logger.info("LinkedIn ICP: no active profiles configured — skipping")
            summary["linkedin_icp_raw"] = 0

    except Exception as e:
        logger.error(f"LinkedIn ICP scraping failed: {e}")
        summary["errors"].append(f"LinkedIn ICP: {str(e)}")
        summary["linkedin_icp_raw"] = 0

    # Step 2b: LinkedIn keyword search (secondary — finds posts from non-ICP users)
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
                # LinkedIn: the search query already acts as the keyword filter.
                # LinkedIn's algorithm returns semantically relevant posts that
                # often don't contain the exact keyword phrases (they may say
                # "hold onto accounts" rather than "client retention"). Running
                # the literal keyword gate here would drop nearly everything.
                # Tag keywords for display/tracking purposes only — don't gate on it.
                post = tag_keywords_matched(post, keywords)
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

    if not all_new_posts and not icp_posts_for_scoring:
        logger.info("No posts retrieved from any platform.")
        return summary

    # Step 4: Deduplicate both pools against existing IDs
    new_posts      = storage.deduplicate(all_new_posts,        existing_ids)
    new_icp_posts  = storage.deduplicate(icp_posts_for_scoring, existing_ids)
    summary["after_dedup"] = len(new_posts) + len(new_icp_posts)

    qualifying = []

    # Step 5a: Score ICP posts with engagement-opportunity prompt
    if new_icp_posts:
        try:
            scored_icp = scorer.score_icp_posts_batch(new_icp_posts)
            qualifying_icp = scorer.filter_by_min_score(scored_icp, min_score=min_score)
            logger.info(f"ICP scoring: {len(new_icp_posts)} posts → {len(qualifying_icp)} qualify (score >= {min_score})")
            qualifying.extend(qualifying_icp)
        except Exception as e:
            logger.error(f"ICP scoring failed: {e}")
            summary["errors"].append(f"ICP scoring: {str(e)}")
            qualifying.extend(new_icp_posts)

    # Step 5b: Score keyword/Facebook posts with pain-signal prompt
    if new_posts:
        try:
            scored_posts = scorer.score_posts_batch(new_posts)
            qualifying_kw = scorer.filter_by_min_score(scored_posts, min_score=min_score)
            logger.info(f"Scoring: {len(new_posts)} posts → {len(qualifying_kw)} qualify (score >= {min_score})")
            qualifying.extend(qualifying_kw)
        except Exception as e:
            logger.error(f"Scoring failed: {e}")
            summary["errors"].append(f"Scoring: {str(e)}")
            qualifying.extend(new_posts)

    summary["after_scoring"] = len(qualifying)

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
