"""
notifier.py — Slack digest builder and sender.

Builds a rich, scannable Slack message from the day's captured posts.
The Claude comment_approach field is the differentiator — each post
comes with a ready-to-use response angle so Mike just clicks and types.
"""

import os
import logging
import requests
from datetime import datetime

logger = logging.getLogger(__name__)

SLACK_API = "https://slack.com/api/chat.postMessage"


def _slack_token():
    token = os.getenv("SLACK_BOT_TOKEN")
    if not token:
        raise ValueError("SLACK_BOT_TOKEN not set in environment")
    return token


def build_digest_message(posts: list, channel_id: str, airtable_base_url: str = "") -> dict:
    """
    Build the Slack Block Kit message payload for the morning digest.
    Returns the full payload dict ready to POST to Slack.
    """
    today = datetime.now().strftime("%A, %B %-d")
    linkedin_posts = [p for p in posts if p.get("Platform") == "LinkedIn"]
    facebook_posts = [p for p in posts if p.get("Platform") == "Facebook"]

    high_value = [p for p in posts if (p.get("Relevance Score") or 0) >= 7]

    blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": f"ClientBloom Market Intelligence — {today}"
            }
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Total new posts:*\n{len(posts)}"},
                {"type": "mrkdwn", "text": f"*High value (7+):*\n{len(high_value)}"},
                {"type": "mrkdwn", "text": f"*LinkedIn:*\n{len(linkedin_posts)}"},
                {"type": "mrkdwn", "text": f"*Facebook:*\n{len(facebook_posts)}"}
            ]
        },
        {"type": "divider"}
    ]

    if not posts:
        blocks.append({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": "No new qualifying posts in the last 24 hours. The listener is still running."
            }
        })
    else:
        # Show top posts (already sorted by relevance score from Airtable query)
        for i, post in enumerate(posts[:15]):
            score = post.get("Relevance Score", 0)
            platform = post.get("Platform", "")
            author = post.get("Author Name", "Unknown")
            group = post.get("Group Name", "")
            post_url = post.get("Post URL", "")
            preview = (post.get("Post Text", "") or "")[:200].replace("\n", " ")
            comment_angle = post.get("Comment Approach", "")

            score_emoji = "🔴" if score >= 8 else "🟡" if score >= 5 else "⚪"
            platform_emoji = "💼" if platform == "LinkedIn" else "📘"

            post_block = {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": (
                        f"{score_emoji} *{i+1}. {author}* — {platform_emoji} {group} *(Score: {score}/10)*\n"
                        f"_{preview}..._\n"
                        f"*Suggested angle:* {comment_angle}"
                    )
                }
            }

            if post_url:
                post_block["accessory"] = {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "View Post"},
                    "url": post_url,
                    "action_id": f"view_post_{i}"
                }

            blocks.append(post_block)
            blocks.append({"type": "divider"})

    # Footer with Airtable link
    footer_text = "Open full list in Airtable →"
    if airtable_base_url:
        footer_text = f"<{airtable_base_url}|Open full list in Airtable →>"

    blocks.append({
        "type": "context",
        "elements": [
            {
                "type": "mrkdwn",
                "text": f"🔄 Listener runs every 3 hours · 🗂 {footer_text} · Mark posts as Commented/Skip in Airtable"
            }
        ]
    })

    return {
        "channel": channel_id,
        "blocks": blocks,
        "text": f"ClientBloom Market Intelligence — {len(posts)} new posts captured"
    }


def send_slack_message(payload: dict) -> bool:
    """
    Post the digest to Slack via Bot Token.
    Returns True on success.
    """
    token = _slack_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    response = requests.post(SLACK_API, headers=headers, json=payload, timeout=15)
    data = response.json()

    if data.get("ok"):
        logger.info(f"Slack digest posted successfully to channel {payload.get('channel')}")
        return True
    else:
        logger.error(f"Slack API error: {data.get('error')} — {data}")
        return False


def send_error_alert(channel_id: str, error_message: str, context: str = "") -> None:
    """
    Send an error alert to Slack if the agent crashes.
    This is how we know it broke without manually checking logs.
    """
    token = os.getenv("SLACK_BOT_TOKEN")
    if not token:
        logger.error("Cannot send Slack error alert — no SLACK_BOT_TOKEN")
        return

    payload = {
        "channel": channel_id,
        "text": f"⚠️ *ClientBloom Listener Error*\n{context}\n```{error_message[:500]}```"
    }

    try:
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        requests.post(SLACK_API, headers=headers, json=payload, timeout=10)
    except Exception as e:
        logger.error(f"Could not send error alert: {e}")
