"""
scorer.py — Claude-powered relevance scoring + response recommendations.

Batches all posts from a single run into ONE Claude API call.
Returns a score (1-10) and a tailored comment angle for each post.
This is what makes this system smarter than a simple keyword filter.
"""

import os
import json
import logging
import anthropic

logger = logging.getLogger(__name__)

SCORE_PROMPT = """You are a sales intelligence analyst supporting Joseph, a sales rep at ClientBloom.ai — an AI-powered client retention platform built specifically for marketing agencies and SaaS companies.

ClientBloom helps agency owners track client health, detect churn risk early, and keep clients longer. Joseph's job is to engage in conversations that naturally lead people to discover ClientBloom — not to pitch it cold.

Your job: score each post on whether it represents a REAL conversation opportunity for Joseph right now. This is a strict filter. Most posts should score low.

WHAT MAKES A HIGH-SCORE POST (7-10):
- Someone is actively venting, asking for help, or expressing frustration about client retention or churn
- Someone is describing a specific client leaving, canceling, or going silent
- Someone is asking how other agency owners handle difficult client situations or retention
- Someone is building or looking for client health/success systems and hitting a wall
- The post invites a response — it has a question, a struggle, or an emotional signal Joseph can genuinely respond to

WHAT MAKES A LOW-SCORE POST (1-4):
- Educational content ("here's how to manage clients"), listicles, or tips posts — these don't invite personal engagement
- Promotional posts or people selling their own services
- General agency advice or business philosophy with no specific pain
- Posts that mention clients in passing but are really about something else (ads, lead gen, hiring, etc.)
- Questions about tools or platforms that have nothing to do with retention

SCORING SCALE:
- 9-10: Direct, active pain signal. Person is struggling right now. Joseph has something real to say and a natural opening to start a dialogue.
- 7-8: Clear interest or frustration. There's a genuine conversation to be had, even if the pain isn't front and center.
- 5-6: Weak signal. The topic is relevant but the post is too generic or one-directional for Joseph to enter naturally.
- 1-4: Not a conversation opportunity. Informational, promotional, or off-topic.

COMMENT APPROACH RULES (only write these for posts scoring 6+):
- Never mention ClientBloom or pitch anything.
- Lead with something that shows you actually read and understood their specific situation.
- Ask ONE question that continues the conversation — not a generic one.
- 2-3 sentences max. Peer-to-peer tone, not salesperson tone.

Return ONLY a JSON array. No markdown, no explanation, no preamble.

[
  {
    "post_index": 0,
    "score": 9,
    "score_reason": "Agency owner venting about losing their third client this quarter and asking what others do differently — direct retention pain, open question, natural entry point",
    "comment_approach": "Three in a quarter usually points to something happening around the 60-90 day mark rather than at the end of the contract. Are you seeing a pattern in when they decide to leave?"
  },
  ...
]

POSTS TO ANALYZE:
{posts_json}
"""


BATCH_SIZE = 25  # safe ceiling — keeps response well under 4096 tokens


def _score_single_batch(client, posts: list, index_offset: int = 0) -> dict:
    """
    Score one batch of posts. Returns a score_map keyed by absolute post index.
    """
    posts_for_scoring = [
        {
            "post_index": index_offset + i,
            "platform": p.get("platform", ""),
            "group_name": p.get("group_name", ""),
            "author_name": p.get("author_name", ""),
            "post_text": p.get("post_text", "")[:500]
        }
        for i, p in enumerate(posts)
    ]

    prompt = SCORE_PROMPT.replace("{posts_json}", json.dumps(posts_for_scoring, indent=2))

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}]
    )

    raw_response = message.content[0].text.strip()

    try:
        scored_results = json.loads(raw_response)
    except json.JSONDecodeError:
        import re
        match = re.search(r'\[.*\]', raw_response, re.DOTALL)
        if match:
            scored_results = json.loads(match.group())
        else:
            logger.error(f"Could not parse Claude batch response: {raw_response[:300]}")
            return {}

    return {r["post_index"]: r for r in scored_results}


def score_posts_batch(posts: list) -> list:
    """
    Score all posts in batches of BATCH_SIZE to avoid token/parse limits.
    Returns the original posts with score and comment_approach added.
    """
    if not posts:
        return []

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not set in environment")

    client = anthropic.Anthropic(api_key=api_key)

    logger.info(f"Scoring {len(posts)} posts in batches of {BATCH_SIZE}...")

    full_score_map = {}
    for batch_start in range(0, len(posts), BATCH_SIZE):
        batch = posts[batch_start:batch_start + BATCH_SIZE]
        logger.info(f"Scoring batch {batch_start // BATCH_SIZE + 1}: posts {batch_start}-{batch_start + len(batch) - 1}")
        try:
            batch_map = _score_single_batch(client, batch, index_offset=batch_start)
            full_score_map.update(batch_map)
        except Exception as e:
            logger.error(f"Batch {batch_start // BATCH_SIZE + 1} failed: {e}")
            # Continue with remaining batches — failed posts keep score 0

    # Merge scores back into original post dicts
    enriched_posts = []
    for i, post in enumerate(posts):
        result = full_score_map.get(i, {})
        enriched = {**post}
        enriched["relevance_score"] = result.get("score", 0)
        enriched["score_reason"] = result.get("score_reason", "")
        enriched["comment_approach"] = result.get("comment_approach", "")
        enriched_posts.append(enriched)

    scored_count = sum(1 for p in enriched_posts if p.get("relevance_score", 0) > 0)
    logger.info(f"Scoring complete. {scored_count}/{len(enriched_posts)} posts received scores.")

    return enriched_posts


def filter_by_min_score(posts: list, min_score: int = 2) -> list:
    """Remove posts that scored below the minimum threshold."""
    return [p for p in posts if p.get("relevance_score", 0) >= min_score]
