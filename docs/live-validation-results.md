# Live Validation Results
## Scout — feature/apify-resilience (Live Apify Calls)

**Run date:** 2026-04-12T19:59:28.758Z  
**Branch:** feature/apify-resilience  
**Test profile:** https://www.linkedin.com/in/satyanadella/  
**Test keyword:** B2B SaaS sales strategy  
**Gates passed:** 3/4  

---

## ✅ Gate 1A — PASS

**Duration:** 10925ms  

**Findings:**
- ℹ️ INFO: Running data-slayer/linkedin-profile-posts-scraper with profile: https://www.linkedin.com/in/satyanadella/
- ℹ️ INFO: waitSecs=90, memory=256MB
- ℹ️ INFO: Apify call completed in 10846ms
- ℹ️ INFO: Actor returned 30 item(s)
- ℹ️ INFO: Actual output keys on item[0]: activity_type, attachments, author, comments, created_at, is_repost, likes, mentions, reactions, share_url, shared_post, shares, text, url, urn
- ✅ PASS: Required field "text" present in actual output
- ✅ PASS: fieldMap "text" → "text" found: "When I launched PostLeads a few weeks ago, the mos..."
- ✅ PASS: fieldMap "author.title" → "authorName" found: "Mayank Chaba..."
- ✅ PASS: fieldMap "author.url" → "authorUrl" found: "https://linkedin.com/in/mayankchaba..."
- ✅ PASS: fieldMap "share_url" → "postUrl" found: "https://www.linkedin.com/posts/mayankchaba_when-i-..."
- ✅ PASS: fieldMap "urn" → "postId" found: "urn:li:activity:7447557605457260544..."
- ✅ PASS: All canonical fields populated after normalization: text, authorName, authorUrl, postUrl, postId
- ✅ PASS: validateActorOutput() accepted actual output

**Raw output sample (first item):**
```json
{
  "activity_type": "Post",
  "attachments": [
    {
      "duration": 262633,
      "type": "Video",
      "url": "https://dms.licdn.com/playlist/vid/dynamic/D5605AQFEUCxPinr0IQ/BAQjDNu6FGY?e=1776628800&v=beta&t=GghYy3uN2OIvM3csGete5Qzu2_qn8CdV_ewOIULWQlY",
      "urn": "urn:li:digitalmediaAsset:D5605AQFEUCxPinr0IQ"
    }
  ],
  "author": {
    "image_url": "https://media.licdn.com/dms/image/v2/D4D03AQFCTqlZGgy6kA/profile-displayphoto-shrink_800_800/profile-displayphoto-shrink_800_800/0/1713521403324?e=1777507200&v=beta&t=jtklmjKWWKf_8HF28FKbB8E-eMqYBQ0wLGYbP8FmQh4",
    "occupation": "LinkedIn post engagers → Verified leads in 5 mins | No LinkedIn login required",
    "public_identifier": "mayankchaba",
    "title": "Mayank Chaba",
    "type": "Member",
    "url": "https://linkedin.com/in/mayankchaba",
    "urn": "urn:li:fsd_profile:ACoAABVjDE4BxX5R567a4KjIWqwi0dG5HUrXYf8"
  },
  "comments": 6,
  "created_at": "2026-04-08T08:15:02.070Z",
  "is_repost": false,
  "likes": 27,
  "mentions": [
    {
      "entity_urn": "urn:li:fsd_company:113025038",
      "name": "PostLeads"
    },
    {
      "entity_urn": "urn:li:fsd_company:13018048",
      "name": "Clay"
    },
    {
      "entity_urn": "urn:li:fsd_company:82935315",
      "name": "Make"
    },
    {
      "entity_urn": "urn:li:fsd_company:28491094",
      "name": "n8n"
    },
    {
      "entity_urn": "urn:li:fsd_company:10608457",
      "name": "Apify"
    }
  ],
  "reactions": [
    {
      "count": 23,
      "reaction_type": "LIKE"
    },
    {
      "count": 4,
      "reaction_type": "INTEREST"
    }
  ],
  "share_url": "https://www.linkedin.com/posts/mayankchaba_when-i-launched-postleads-a-few-weeks-ago-activity-7447557605457260544-Xy3F?utm_source=social_share_send&utm_medium=android_app&rcm=ACoAAEfypsUBSaHB6aT7j_6pKIay_nvP4Z2bKYs",
  "shared_post": null,
  "shares": 3,
  "text": "When I launched PostLeads a few weeks ago, the most common question wasn't about features or pricing.\n\nIt was: \"Can I plug t
```

---

## ✅ Gate 1B — PASS

**Duration:** 8640ms  

**Findings:**
- ℹ️ INFO: Running powerai/linkedin-posts-search-scraper with keyword: "B2B SaaS sales strategy"
- ℹ️ INFO: waitSecs=90, memory=256MB
- ℹ️ INFO: Apify call completed in 8560ms
- ℹ️ INFO: Actor returned 10 item(s)
- ℹ️ INFO: Actual output keys on item[0]: id, url, title, activity, created_at, author, scrapedAt
- ✅ PASS: Required field "title" present in actual output
- ✅ PASS: fieldMap "title" → "text" found: "Artificial Intelligence is no longer for only Tech..."
- ✅ PASS: fieldMap "author.name" → "authorName" found: "Rubina Khan..."
- ✅ PASS: fieldMap "author.url" → "authorUrl" found: "https://www.linkedin.com/in/rkhan75..."
- ✅ PASS: fieldMap "url" → "postUrl" found: "https://www.linkedin.com/feed/update/urn:li:activi..."
- ✅ PASS: fieldMap "id" → "postId" found: "7449154379678498816..."
- ✅ PASS: All canonical fields populated after normalization: text, authorName, authorUrl, postUrl, postId
- ✅ PASS: validateActorOutput() accepted actual output

**Raw output sample (first item):**
```json
{
  "id": "7449154379678498816",
  "url": "https://www.linkedin.com/feed/update/urn:li:activity:7449154379678498816",
  "title": "Artificial Intelligence is no longer for only Tech Experts",
  "activity": {
    "num_likes": 0,
    "num_comments": 0,
    "num_shares": 0,
    "reaction_counts": []
  },
  "created_at": "2026-04-12T18:59:08.704Z",
  "author": {
    "name": "Rubina Khan",
    "description": "Chief Strategy Officer (CSO) | Entrepreneur | Business & People Strategy Leader",
    "url": "https://www.linkedin.com/in/rkhan75",
    "avatar": [
      {
        "width": 100,
        "height": 100,
        "url": "https://media.licdn.com/dms/image/v2/D5603AQG9Svr4vDhDEQ/profile-displayphoto-shrink_100_100/profile-displayphoto-shrink_100_100/0/1702095018778?e=1777507200&v=beta&t=4Kdxkn3GqN7uXGdof2_fHvi3vSWdogPubw9KNUzVbCE",
        "expires_at": 1777507200000
      },
      {
        "width": 200,
        "height": 200,
        "url": "https://media.licdn.com/dms/image/v2/D5603AQG9Svr4vDhDEQ/profile-displayphoto-shrink_200_200/profile-displayphoto-shrink_200_200/0/1702095018778?e=1777507200&v=beta&t=5t6nHeXuOkXKCh2y6WM0qzsELgaUlV5IaOzxQm1cnJ4",
        "expires_at": 1777507200000
      },
      {
        "width": 400,
        "height": 400,
        "url": "https://media.licdn.com/dms/image/v2/D5603AQG9Svr4vDhDEQ/profile-displayphoto-shrink_400_400/profile-displayphoto-shrink_400_400/0/1702095018778?e=1777507200&v=beta&t=9YYbny4wDmSXw2D1nMXjzeAT7B01dutpJB0y3I3HDE0",
        "expires_at": 1777507200000
      },
      {
        "width": 800,
        "height": 800,
        "url": "https://media.licdn.com/dms/image/v2/D5603AQG9Svr4vDhDEQ/profile-displayphoto-shrink_800_800/profile-displayphoto-shrink_800_800/0/1702095018778?e=1777507200&v=beta&t=T9RwDyJQIxfsIpMfp6IJ3AwGZGrI7s3WjtVMCLfp7nw",
        "expires_at": 1777507200000
      }
    ]
  },
  "scrapedAt": "2026-04-12T19:59:08.909Z"
}
```

---

## ✅ Gate 2 — PASS

**Duration:** 17787ms  

**Findings:**
- ℹ️ INFO: Running harvestapi/linkedin-profile-posts at 256MB...
- ℹ️ INFO: 256MB — 10 items in 6257ms (error: none)
- ℹ️ INFO: Running harvestapi/linkedin-profile-posts at 1024MB...
- ℹ️ INFO: 1024MB — 10 items in 6364ms (error: none)
- ✅ PASS: Result counts match within tolerance (256MB: 10, 1024MB: 10, diff: 0)
- ✅ PASS: 256MB is confirmed sufficient for harvestapi/linkedin-profile-posts. No global default change needed.
- ℹ️ INFO: CU cost — 256MB: 0.000435 CU ($0.000130), 1024MB: 0.001768 CU ($0.000530)

**Raw output sample (first item):**
```json
{
  "type": "post",
  "id": "7448514963196911616",
  "linkedinUrl": "https://www.linkedin.com/posts/satyanadella_the-folks-at-github-released-a-new-feature-activity-7448514963196911616-jyoO",
  "content": "In GitHub Copilot CLI, you can now leverage a multi-model reflection loop as a reviewer.\n \nSuper helpful for catching issues early before they compound.",
  "contentAttributes": [],
  "author": {
    "id": "ACoAAAEkwwAB9KEc2TrQgOLEQ-vzRyZeCDyc6DQ",
    "universalName": null,
    "publicIdentifier": "satyanadella",
    "type": "profile",
    "name": "Satya Nadella",
    "linkedinUrl": "https://www.linkedin.com/in/satyanadella?miniProfileUrn=urn%3Ali%3Afsd_profile%3AACoAAAEkwwAB9KEc2TrQgOLEQ-vzRyZeCDyc6DQ",
    "info": "Chairman and CEO at Microsoft",
    "website": null,
    "websiteLabel": null,
    "avatar": {
      "url": "https://media.licdn.com/dms/image/v2/C5603AQHHUuOSlRVA1w/profile-displayphoto-shrink_800_800/profile-displayphoto-shrink_800_800/0/1579726625483?e=1777507200&v=beta&t=s5rW06A8-uP2GPRxYCNE3_FE_KZFRTmDBGxWUCeIRnM",
      "width": 800,
      "height": 800,
      "expiresAt": 1777507200000
    },
    "urn": "19186432"
  },
  "postedAt": {
    "timestamp": 1775864353942,
    "date": "2026-04-10T23:39:13.942Z",
    "postedAgoShort": "1d",
    "postedAgoText": "1 day ago • Visible to anyone on or off LinkedIn"
  },
  "postImages": [],
  "repostId": "7447407293643526145",
  "socialContent": {
    "hideCommentsCount": false,
    "hideReactionsCount": false,
    "hideSocialActivityCounts": false,
    "hideShareAction": true,
    "hideSendAction": true,
    "hideRepostsCount": false,
    "hideViewsCount": false,
    "trustInterventionBanner": null,
    "hideReactAction": false,
    "hideCommentAction": false,
    "shareUrl": "https://www.linkedin.com/posts/satyanadella_the-folks-at-github-released-a-new-feature-activity-7448514963196911616-jyoO?",
    "showContributionExperience": false,
    "showSocialDetail": true
  },
  "comments": [],
  "header": {
```

---

## ❌ Gate 3 — FAIL

**Duration:** 0ms  

**Findings:**
- ℹ️ SKIP: No TENANT_ID provided. Set TENANT_ID=recXXXXXXXXXXXXXX to run end-to-end scan gate.

---

