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


def _build_prompt(base_prompt: str, posts_json_str: str, business_profile: str = "", custom_prompt: str = "") -> str:
    """
    Build the final scoring prompt.
    - If custom_prompt is set, it replaces base_prompt entirely.
    - business_profile is prepended as a context block when provided.
    - Posts JSON is appended at the end with a standard header.
    """
    active_prompt = custom_prompt.strip() if custom_prompt.strip() else base_prompt

    if "{posts_json}" in active_prompt:
        filled = active_prompt.replace("{posts_json}", posts_json_str)
    else:
        # Custom prompts may not have the placeholder — append posts as a block
        filled = active_prompt.rstrip() + f"\n\nPOSTS TO ANALYZE:\n{posts_json_str}"

    if business_profile:
        header = f"BUSINESS CONTEXT (use this to calibrate scoring and comment angles):\n{business_profile}\n\n"
        filled = header + filled
    return filled


def _score_single_batch(client, posts: list, index_offset: int = 0, business_profile: str = "", custom_prompt: str = "") -> dict:
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

    prompt = _build_prompt(SCORE_PROMPT, json.dumps(posts_for_scoring, indent=2), business_profile, custom_prompt)

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


def score_posts_batch(posts: list, business_profile: str = "", custom_prompt: str = "") -> list:
    """
    Score all posts in batches of BATCH_SIZE to avoid token/parse limits.
    Returns the original posts with score and comment_approach added.

    Args:
        posts: list of post dicts
        business_profile: optional multi-line string describing the tenant's business context.
                          Fetched from Airtable 'Business Profile' table by agent.py and passed here.
    """
    if not posts:
        return []

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not set in environment")

    client = anthropic.Anthropic(api_key=api_key)

    logger.info(f"Scoring {len(posts)} posts in batches of {BATCH_SIZE}...")
    if custom_prompt:
        logger.info("Custom scoring prompt active — using saved prompt from Airtable.")
    elif business_profile:
        logger.info("Business profile context will be injected into scoring prompts.")

    full_score_map = {}
    for batch_start in range(0, len(posts), BATCH_SIZE):
        batch = posts[batch_start:batch_start + BATCH_SIZE]
        logger.info(f"Scoring batch {batch_start // BATCH_SIZE + 1}: posts {batch_start}-{batch_start + len(batch) - 1}")
        try:
            batch_map = _score_single_batch(client, batch, index_offset=batch_start, business_profile=business_profile, custom_prompt=custom_prompt)
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


# ---------------------------------------------------------------------------
# ICP Engagement Scoring — people-first LinkedIn monitoring
# ---------------------------------------------------------------------------

ICP_SCORE_PROMPT = """You are a relationship intelligence analyst supporting Joseph, a sales rep at ClientBloom.ai — an AI-powered client retention platform built for marketing agencies and SaaS companies.

Joseph's LinkedIn strategy is different from cold outreach. He monitors a curated list of ideal customer profiles (ICPs) — agency owners, agency CEOs, client success leaders, and marketing operators. When one of them posts ANYTHING, Joseph looks for a natural, authentic reason to comment and start a relationship. He is not selling. He is becoming a familiar, valuable face in their feed.

Your job: score each ICP post on whether it gives Joseph a credible, non-salesy reason to leave a comment that would genuinely start a conversation.

ABOUT THE ICP:
Each post includes the author's name, job title, and company in the "group_name" field (e.g., "LinkedIn ICP: Agency Owner @ Growth Marketing Co"). Use this context when writing the comment approach.

WHAT MAKES A HIGH-SCORE POST (7-10):
- Author asks a question (any topic) — Joseph can answer and build rapport
- Author shares a struggle, frustration, or challenge — Joseph can empathize specifically
- Author announces a milestone (new client, team growth, new service) — Joseph can celebrate and ask a follow-up
- Author shares a strong opinion or controversial take — Joseph can thoughtfully agree/disagree
- Author shares a case study or win — Joseph can ask about the process behind it
- Topic is directly related to client management, retention, agency operations, or team building

WHAT MAKES A LOW-SCORE POST (2-4):
- Pure broadcast: sharing a news article with no personal commentary
- Generic motivational quote or platitude
- Job posting with no personal narrative
- Promotional content about their own services (no invitation to engage)
- Reshare of someone else's content with no added perspective

WHAT SCORES 1:
- Clearly automated or bot-like content
- Completely off-topic (sports, politics, personal life with no business angle)
- Content so generic there is no personalized hook Joseph could use

SCORING SCALE:
- 9-10: Strong natural opening. Joseph has something specific and genuine to say.
- 7-8: Good opening. A thoughtful comment would land well.
- 5-6: Weak hook. Possible, but the comment would feel forced or generic.
- 2-4: No natural entry point. Post doesn't invite engagement.
- 1: Skip entirely.

COMMENT APPROACH RULES (write for posts scoring 5+):
- Never mention ClientBloom or pitch anything — this is relationship-building only.
- Reference something SPECIFIC from their post — not a generic "great post!"
- Keep it to 2 sentences max. Peer tone. Sound like someone in the same world.
- Ask ONE follow-up question OR make one observation that invites a reply.
- Use the author's title/company context to make it feel personalized.

Return ONLY a JSON array. No markdown, no explanation.

[
  {{
    "post_index": 0,
    "score": 8,
    "score_reason": "Agency CEO asking how other owners handle scope creep with retainer clients — direct question, clear invitation to engage, topic adjacent to retention",
    "comment_approach": "Scope creep on retainers usually comes down to what was defined (or not) at onboarding. How specific are your SOWs right now — like, do clients know exactly what's in and out of scope before month one starts?"
  }},
  ...
]

POSTS TO ANALYZE:
{posts_json}
"""


def score_icp_posts_batch(posts: list, business_profile: str = "", custom_prompt: str = "") -> list:
    """
    Score ICP LinkedIn posts using the engagement-opportunity prompt.
    Strips internal _icp_* fields before returning (they were for scoring context only).

    Args:
        posts: list of ICP post dicts
        business_profile: optional multi-line string describing the tenant's business context.
    """
    if not posts:
        return []

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not set in environment")

    client = anthropic.Anthropic(api_key=api_key)

    logger.info(f"ICP scoring {len(posts)} posts in batches of {BATCH_SIZE}...")

    full_score_map = {}
    for batch_start in range(0, len(posts), BATCH_SIZE):
        batch = posts[batch_start:batch_start + BATCH_SIZE]
        posts_for_scoring = [
            {
                "post_index": batch_start + i,
                "platform": p.get("platform", "LinkedIn"),
                "group_name": p.get("group_name", ""),   # contains "LinkedIn ICP: Title @ Company"
                "author_name": p.get("author_name", ""),
                "author_headline": p.get("_author_headline", ""),
                "icp_job_title": p.get("_icp_title", ""),
                "icp_company": p.get("_icp_company", ""),
                "post_text": p.get("post_text", "")[:500]
            }
            for i, p in enumerate(batch)
        ]

        prompt = _build_prompt(ICP_SCORE_PROMPT, json.dumps(posts_for_scoring, indent=2), business_profile, custom_prompt)

        try:
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
                scored_results = json.loads(match.group()) if match else []

            for r in scored_results:
                full_score_map[r["post_index"]] = r

        except Exception as e:
            logger.error(f"ICP batch {batch_start // BATCH_SIZE + 1} failed: {e}")

    # Merge scores back, strip internal ICP context fields
    enriched = []
    for i, post in enumerate(posts):
        result = full_score_map.get(i, {})
        clean = {k: v for k, v in post.items() if not k.startswith("_")}
        clean["relevance_score"]  = result.get("score", 0)
        clean["score_reason"]     = result.get("score_reason", "")
        clean["comment_approach"] = result.get("comment_approach", "")
        enriched.append(clean)

    scored_count = sum(1 for p in enriched if p.get("relevance_score", 0) > 0)
    logger.info(f"ICP scoring complete. {scored_count}/{len(enriched)} posts received scores.")
    return enriched
