# ClientBloom Social Listener — Setup Guide

Everything is built. This guide covers the four credential steps to go live.
Total time: approximately 25 minutes.

---

## What You're Setting Up

| Credential | Where to Get It | Time |
|---|---|---|
| Apify API token | apify.com | 5 min |
| Airtable API token + Base ID | airtable.com | 10 min |
| Anthropic API key | console.anthropic.com | 2 min |
| Vercel deployment | vercel.com | 8 min |

---

## Step 1 — Create the .env File

In the `social-listener` folder, duplicate `.env.example` and rename it `.env`.

Open `.env` and fill in each value as you complete the steps below. Do not share this file with anyone.

---

## Step 2 — Apify (5 minutes)

1. Go to **apify.com** and create a free account (or log in)
2. In the top menu: **Console → Settings → Integrations**
3. Under "Personal API tokens", click **+ Add new token**
4. Name it: `clientbloom-listener`
5. Copy the token and paste it into `.env` as `APIFY_API_TOKEN`

**Verify the actors exist:**
Before the first run, search the Apify Store for:
- `apify/linkedin-posts-scraper` — confirm it shows as available
- `apify/facebook-groups-scraper` — confirm it shows as available

If either actor is unavailable or has a different name, open `config.yaml` and update the `actor_id` fields under the `apify:` section.

---

## Step 3 — Airtable (10 minutes)

### 3a — Create the Base

1. Go to **airtable.com** and log in
2. Click **+ Add a base** → Start from scratch
3. Name the base: `ClientBloom Social Listener`

### 3b — Create Table 1: `Captured Posts`

Delete the default table and create a new one called `Captured Posts`.

Add these fields **in this exact order** with these exact names:

| Field Name | Field Type | Notes |
|---|---|---|
| `Post ID` | Single line text | Primary field — rename the default "Name" field |
| `Platform` | Single select | Add options: LinkedIn, Facebook |
| `Group Name` | Single line text | |
| `Author Name` | Single line text | |
| `Author Profile URL` | URL | |
| `Post Text` | Long text | |
| `Post URL` | URL | |
| `Keywords Matched` | Single line text | |
| `Relevance Score` | Number | Set to integer, no decimals |
| `Score Reason` | Single line text | |
| `Comment Approach` | Long text | |
| `Captured At` | Date | Enable "Include time field", use ISO format |
| `Status` | Single select | Add options: New, Commented, Skip, Follow Up |

### 3c — Create Table 2: `Target Groups`

Add a second table called `Target Groups`.

| Field Name | Field Type |
|---|---|
| `Group Name` | Single line text (Primary) |
| `Platform` | Single select: LinkedIn, Facebook |
| `Group URL` | URL |
| `Active` | Checkbox |
| `Priority` | Single select: High, Medium, Low |

You don't need to add records — the agent uses `config.yaml` for group targeting. This table is optional for manual tracking.

### 3d — Get the Base ID

1. Open your new Airtable base in the browser
2. Look at the URL: `https://airtable.com/appXXXXXXXXXXXXXX/...`
3. The `appXXXXXXXXXXXXXX` part is your Base ID
4. Paste it into `.env` as `AIRTABLE_BASE_ID`

### 3e — Create an API Token

1. Go to: **airtable.com/create/tokens**
2. Click **+ Create new token**
3. Name: `clientbloom-listener`
4. Scopes — add all three:
   - `data.records:read`
   - `data.records:write`
   - `schema.bases:read`
5. Access: select your `ClientBloom Social Listener` base
6. Click **Create token**, copy it
7. Paste into `.env` as `AIRTABLE_API_TOKEN`

---

## Step 4 — Anthropic API Key (2 minutes)

1. Go to **console.anthropic.com**
2. Click **API Keys** in the left sidebar
3. Click **+ Create Key**
4. Name it: `clientbloom-listener`
5. Copy the key (you only see it once)
6. Paste into `.env` as `ANTHROPIC_API_KEY`

**Estimated cost:** Under $10/month at current volumes.

---

## Step 5 — First Test Run

Before activating the schedule, run a manual test to confirm everything connects:

```bash
cd /path/to/social-listener
pip install -r requirements.txt
python test_mock.py       # validates logic (no credentials used)
python agent.py scrape    # live test — uses all credentials
```

The live test will:
1. Pull from Apify (real scraping job, takes 2-5 minutes)
2. Score results with Claude
3. Write any qualifying posts to Airtable
4. Log a summary to your terminal

If it completes without errors, you're live. The scheduled tasks take over from here.

---

## Step 6 — Deploy the Dashboard to Vercel (8 minutes)

### 6a — Install Vercel CLI (if not already installed)

```bash
npm install -g vercel
```

### 6b — Deploy

```bash
cd /path/to/social-listener/dashboard
npm install
vercel
```

Follow the prompts:
- Set up a new project? **Yes**
- Which scope? Choose your Vercel account
- Link to existing project? **No**
- Project name: `clientbloom-intel`
- Framework: **Next.js** (auto-detected)

### 6c — Add Environment Variables in Vercel

After deployment, go to your Vercel project dashboard:
1. **Settings → Environment Variables**
2. Add these three:

| Name | Value |
|---|---|
| `AIRTABLE_API_TOKEN` | (paste your Airtable token) |
| `AIRTABLE_BASE_ID` | (paste your base ID) |
| `AIRTABLE_POSTS_TABLE` | `Captured Posts` |

3. Redeploy: `vercel --prod`

Your dashboard will be live at `https://clientbloom-intel.vercel.app` (or similar).

---

## Step 7 — Approve the Scheduled Tasks

The two Cowork scheduled tasks are already created:
- `clientbloom-social-scraper` — runs every 3 hours
- `clientbloom-morning-digest` — runs daily at 7:00 AM Pacific

To pre-approve tool permissions so they never pause mid-run:
1. Open the **Scheduled** section in the Cowork sidebar
2. Click `clientbloom-social-scraper` → **Run now**
3. When prompted to approve Bash/tool access, approve and check "Remember for this task"
4. Repeat for `clientbloom-morning-digest`

That's it. The system runs itself from here.

---

## Daily Workflow (10 minutes/day)

**7:00 AM** — Slack #AIOS receives the morning digest
- Posts sorted by relevance score
- Each post shows author, group, preview, and a ready-to-use comment angle
- Click "View Post" to open it directly

**Your only job:**
1. Read the digest
2. Click into any post worth engaging
3. Use the suggested comment angle as a starting point (or write your own)
4. Update the post Status in Airtable to "Commented" or "Skip"

**Weekly (5 minutes):**
- Add new Facebook groups or LinkedIn search terms to `config.yaml`
- Check the dashboard for which sources are producing the most high-value posts

---

## Credential Summary (for .env)

```
APIFY_API_TOKEN=         ← from apify.com/account/integrations
AIRTABLE_API_TOKEN=      ← from airtable.com/create/tokens
AIRTABLE_BASE_ID=        ← from your Airtable base URL (appXXXXXX)
ANTHROPIC_API_KEY=       ← from console.anthropic.com
```

---

## Estimated Monthly Cost

| Service | Cost |
|---|---|
| Apify Starter | ~$49/mo |
| Anthropic Claude API | ~$5-15/mo |
| Airtable | Free tier (sufficient) |
| Vercel | Free tier (sufficient) |
| **Total** | **~$55-65/mo** |

---

## Productizing for Clients

To add a new client instance:
1. Duplicate `config.yaml` → rename to `config-[clientname].yaml`
2. Update keywords, groups, Slack channel, and Airtable base ID
3. Create a new Airtable base for that client using the same table structure
4. Deploy a separate dashboard instance with their credentials
5. Create a new scheduled task pointing to their config file

Each additional client costs ~$5-15/mo in API costs beyond their own Apify account.

---

*Built for ClientBloom.ai | Mike Walker | BrightLink Consulting*
