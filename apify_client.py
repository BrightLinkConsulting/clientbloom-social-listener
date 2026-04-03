"""
apify_client.py — Apify API wrapper with proper async polling.

Key fix over the original brief: we capture the run ID from the trigger
response and poll THAT specific run's status until complete, then fetch
from its exact dataset. No race conditions, no 60-second guesses.
"""

import os
import time
import requests
import logging

logger = logging.getLogger(__name__)

APIFY_BASE = "https://api.apify.com/v2"


def _headers():
    token = os.getenv("APIFY_API_TOKEN")
    if not token:
        raise ValueError("APIFY_API_TOKEN not set in environment")
    return {"Authorization": f"Bearer {token}"}


def trigger_actor(actor_id: str, input_data: dict) -> str:
    """
    Start an Apify actor run. Returns the run ID.
    We use this run ID for all subsequent status checks and data fetches,
    so we never accidentally read a different run's results.
    """
    actor_id_slug = actor_id.replace("/", "~")
    url = f"{APIFY_BASE}/acts/{actor_id_slug}/runs"

    response = requests.post(url, json=input_data, headers=_headers(), timeout=30)
    response.raise_for_status()

    run_data = response.json().get("data", {})
    run_id = run_data.get("id")
    if not run_id:
        raise ValueError(f"Apify did not return a run ID. Response: {response.text}")

    logger.info(f"Apify actor {actor_id} triggered. Run ID: {run_id}")
    return run_id


def poll_until_complete(run_id: str, poll_interval: int = 30, max_attempts: int = 20) -> dict:
    """
    Poll the specific run's status endpoint until it succeeds or fails.
    Returns the completed run data including the dataset ID.

    This is the critical reliability fix — we wait as long as it takes
    (up to max_attempts * poll_interval seconds) rather than guessing.
    """
    url = f"{APIFY_BASE}/actor-runs/{run_id}"

    for attempt in range(1, max_attempts + 1):
        response = requests.get(url, headers=_headers(), timeout=30)
        response.raise_for_status()

        run_data = response.json().get("data", {})
        status = run_data.get("status")

        logger.info(f"Run {run_id} status: {status} (attempt {attempt}/{max_attempts})")

        if status == "SUCCEEDED":
            return run_data
        elif status in ("FAILED", "ABORTED", "TIMED-OUT"):
            raise RuntimeError(f"Apify run {run_id} ended with status: {status}")
        elif status in ("READY", "RUNNING"):
            if attempt < max_attempts:
                time.sleep(poll_interval)
        else:
            logger.warning(f"Unknown status '{status}' for run {run_id}, continuing to poll")
            time.sleep(poll_interval)

    raise TimeoutError(
        f"Apify run {run_id} did not complete after {max_attempts * poll_interval}s"
    )


def fetch_dataset(run_data: dict) -> list:
    """
    Fetch the results from the run's specific dataset.
    Uses the dataset ID from the completed run — never /runs/last.
    """
    dataset_id = run_data.get("defaultDatasetId")
    if not dataset_id:
        raise ValueError(f"No dataset ID found in run data: {run_data}")

    url = f"{APIFY_BASE}/datasets/{dataset_id}/items"
    params = {"format": "json", "clean": "true"}

    response = requests.get(url, headers=_headers(), params=params, timeout=60)
    response.raise_for_status()

    items = response.json()
    logger.info(f"Fetched {len(items)} items from dataset {dataset_id}")
    return items


def run_actor_and_fetch(actor_id: str, input_data: dict, poll_interval: int = 30, max_attempts: int = 20) -> list:
    """
    Convenience wrapper: trigger → poll → fetch. Returns the list of result items.
    This is the main function called by agent.py.
    """
    run_id = trigger_actor(actor_id, input_data)
    run_data = poll_until_complete(run_id, poll_interval, max_attempts)
    return fetch_dataset(run_data)


# --- Actor input builders ---

def build_linkedin_input(search_query: str, max_results: int = 50) -> dict:
    """
    Build the input payload for apimaestro/linkedin-posts-search-scraper-no-cookies.
    This actor takes a single searchQuery string (not an array) and returns
    up to `limit` posts sorted by relevance. Agent loops per search term.
    """
    return {
        "searchQuery": search_query,
        "limit": max_results,
        "sort_type": "relevance",
        "proxy": {
            "useApifyProxy": True
        }
    }


def build_facebook_input(group_urls: list, max_posts: int = 30) -> dict:
    """
    Build the input payload for the Facebook Groups Scraper actor.
    Public groups only — no cookies required.
    """
    return {
        "startUrls": [{"url": url} for url in group_urls],
        "resultsLimit": max_posts,
        "maxComments": 0,
        "scrapeAbout": False,
        "proxy": {
            "useApifyProxy": True,
            "apifyProxyGroups": ["RESIDENTIAL"]
        }
    }
