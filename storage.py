"""
storage.py — Airtable operations.

Key fix over the original brief:
- ONE read to fetch all existing Post IDs at the start of each run
- Deduplication happens in memory (Python set comparison)
- ONE batch write for all new posts
- Zero per-post API calls = zero rate limit issues
"""

import os
import hashlib
import logging
import requests
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

AIRTABLE_BASE = "https://api.airtable.com/v0"


def _headers():
    token = os.getenv("AIRTABLE_API_TOKEN")
    if not token:
        raise ValueError("AIRTABLE_API_TOKEN not set in environment")
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }


def _base_id():
    base_id = os.getenv("AIRTABLE_BASE_ID")
    if not base_id:
        raise ValueError("AIRTABLE_BASE_ID not set in environment")
    return base_id


def fetch_all_post_ids(posts_table: str) -> set:
    """
    Fetch all existing Post IDs from Airtable in one paginated read.
    Returns a set of strings for O(1) duplicate lookup.
    """
    base_id = _base_id()
    url = f"{AIRTABLE_BASE}/{base_id}/{posts_table}"
    params = {
        "fields[]": "Post ID",
        "pageSize": 100
    }

    all_ids = set()
    offset = None

    while True:
        if offset:
            params["offset"] = offset

        response = requests.get(url, headers=_headers(), params=params, timeout=30)
        response.raise_for_status()

        data = response.json()
        records = data.get("records", [])

        for record in records:
            post_id = record.get("fields", {}).get("Post ID")
            if post_id:
                all_ids.add(post_id)

        offset = data.get("offset")
        if not offset:
            break

    logger.info(f"Fetched {len(all_ids)} existing Post IDs from Airtable")
    return all_ids


def _text_hash(text: str) -> str:
    """Short hash of normalized post text — catches cross-posted duplicates."""
    normalized = " ".join(text.lower().split())[:300]
    return hashlib.md5(normalized.encode()).hexdigest()[:12]


def deduplicate(posts: list, existing_ids: set) -> list:
    """
    Filter out posts that already exist in Airtable.
    Also deduplicates within the current batch by:
      1. Post ID (same post in same group)
      2. Text hash (same post cross-posted to multiple groups by the same person)
    """
    seen_ids = set()
    seen_text_hashes = set()
    new_posts = []

    for post in posts:
        post_id = post.get("post_id", "")
        if not post_id:
            continue
        if post_id in existing_ids:
            continue
        if post_id in seen_ids:
            continue

        # Text-based dedup — catches cross-posters spamming multiple groups
        text = post.get("post_text", "")
        if text:
            text_hash = _text_hash(text)
            if text_hash in seen_text_hashes:
                continue
            seen_text_hashes.add(text_hash)

        seen_ids.add(post_id)
        new_posts.append(post)

    logger.info(f"Dedup: {len(posts)} raw → {len(new_posts)} new posts to save")
    return new_posts


def batch_save_posts(posts: list, posts_table: str) -> int:
    """
    Save new posts to Airtable in batches of 10 (Airtable's API limit per request).
    Returns count of successfully saved records.
    """
    if not posts:
        logger.info("No new posts to save.")
        return 0

    base_id = _base_id()
    url = f"{AIRTABLE_BASE}/{base_id}/{posts_table}"
    saved_count = 0

    # Airtable limits 10 records per create request
    for i in range(0, len(posts), 10):
        batch = posts[i:i + 10]
        records = [{"fields": _map_to_airtable(post)} for post in batch]

        response = requests.post(
            url,
            headers=_headers(),
            json={"records": records},
            timeout=30
        )

        if response.status_code in (200, 201):
            saved_count += len(batch)
            logger.info(f"Saved batch of {len(batch)} posts (total so far: {saved_count})")
        else:
            logger.error(f"Airtable save error {response.status_code}: {response.text[:200]}")

    return saved_count


def _map_to_airtable(post: dict) -> dict:
    """Map internal post dict to Airtable field names."""
    return {
        "Post ID": str(post.get("post_id", "")),
        "Platform": post.get("platform", ""),
        "Group Name": post.get("group_name", ""),
        "Author Name": post.get("author_name", ""),
        "Author Profile URL": post.get("author_profile_url", ""),
        "Post Text": post.get("post_text", "")[:2000],
        "Post URL": post.get("post_url", ""),
        "Keywords Matched": post.get("keywords_matched", ""),
        "Relevance Score": post.get("relevance_score", 0),
        "Score Reason": post.get("score_reason", ""),
        "Comment Approach": post.get("comment_approach", ""),
        "Captured At": post.get("captured_at", datetime.now(timezone.utc).isoformat()),
    }


def fetch_posts_for_digest(posts_table: str, since_hours: int = 24, min_score: int = 4) -> list:
    """
    Fetch posts captured in the last N hours with score >= min_score.
    Used by the morning digest.
    Returns list of post field dicts, sorted by Relevance Score descending.
    """
    from datetime import timedelta

    base_id = _base_id()
    url = f"{AIRTABLE_BASE}/{base_id}/{posts_table}"

    cutoff = datetime.now(timezone.utc) - timedelta(hours=since_hours)
    cutoff_str = cutoff.strftime("%Y-%m-%dT%H:%M:%S.000Z")

    params = {
        "filterByFormula": f"AND({{Relevance Score}}>={min_score}, IS_AFTER({{Captured At}}, '{cutoff_str}'))",
        "sort[0][field]": "Relevance Score",
        "sort[0][direction]": "desc",
        "pageSize": 100
    }

    all_posts = []
    offset = None

    while True:
        if offset:
            params["offset"] = offset

        response = requests.get(url, headers=_headers(), params=params, timeout=30)
        response.raise_for_status()

        data = response.json()
        records = data.get("records", [])
        all_posts.extend([r.get("fields", {}) for r in records])

        offset = data.get("offset")
        if not offset:
            break

    logger.info(f"Fetched {len(all_posts)} posts for digest")
    return all_posts
