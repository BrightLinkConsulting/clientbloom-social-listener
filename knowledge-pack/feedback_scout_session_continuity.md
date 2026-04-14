---
name: Scout — Session continuity protocol
description: Mandatory startup protocol for every Scout session — prevents feature regression from context compression or stale file reads
type: feedback
---

## The Problem

When a conversation gets long, context compression produces a condensed history. If Claude then edits a large file using a reconstructed understanding rather than a fresh read from GitHub, previously working features get overwritten.

**Why:** This has happened multiple times with Scout — CRM tab clobbered, Team tab clobbered, ClientBloom logo SVG replaced with "CB" text square, countdown timer lost, action flow optimistic updates regressed. In every case the root cause was the same: an edit made from a stale or reconstructed mental model rather than a fresh file read.

**How to apply:** Follow the startup protocol below at the beginning of every Scout session, without exception.

---

## Session Startup Protocol (mandatory before any code changes)

**Step 1 — Read the project folder knowledge files**

The project folder (SCOUT by ClientBloom) contains the authoritative knowledge pack. Read them in this order:
1. `MEMORY.md` — the index
2. `SCOUT_PROJECT_PRIMER.md` — orientation, what is working, what is not, action state machine
3. Files relevant to today's task (Airtable schema, action flows, UI components, etc.)

**Step 2 — Sync the GitHub clone**
```bash
cd /tmp/sl-check && git stash && git pull --rebase origin main && git stash pop
```
If `/tmp/sl-check` doesn't exist, re-clone:
```bash
git clone https://ghp_YOUR_PAT_HERE@github.com/BrightLinkConsulting/clientbloom-social-listener.git /tmp/sl-check
cd /tmp/sl-check && git config user.email "twp1996@gmail.com" && git config user.name "Mike Walker"
```

**Step 3 — Read the specific files you will edit, AFTER the pull**

Never use a file read from earlier in the session. Always re-read after the pull. The relevant developer docs in `/tmp/sl-check/docs/` are also authoritative and should be read before editing any system they describe.

**Step 4 — Make the smallest targeted edit possible**

Use the Edit tool (find/replace) rather than rewriting sections. This preserves all surrounding code that wasn't intended to change.

**Step 5 — Commit immediately after each logical change**

Don't accumulate multiple changes before committing. Each logical fix = one commit. Commit message format: HEREDOC with `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` footer.

**Step 6 — Update the relevant knowledge pack files after each commit**

Update `project_social_listener.md` (commit hash + what changed) and any other file whose facts changed. This is what prevents future sessions from re-learning the same lessons.

---

## What to Check If Something "Stopped Working"

1. Is there a red error banner in the UI? (action errors surface there now)
2. Does the browser console show a network error or non-2xx response?
3. Has the relevant Airtable field been confirmed to exist? (`feedback_scout_airtable_schema.md`)
4. Is `/tmp/sl-check` up to date with deployed? (`git log --oneline -5` vs Vercel deployment log)
5. Was the file possibly reconstructed in a prior session? (`git diff HEAD~1 HEAD -- path/to/file`)

---

## Features That Have Been Clobbered Before (Never Overwrite These)

- **ClientBloom SVG bloom mark** in `page.tsx` and `settings/page.tsx` — if it becomes a "CB" text square, it was overwritten
- **CRM tab** in ActionFilter — was lost once when `page.tsx` was rebuilt from a stale base
- **Team tab** in Settings — was lost once when `settings/page.tsx` was rebuilt from a stale base
- **NextScanCountdown** component in feed footer — was lost in b8a2f4a clobber
- **Replied state Activity Log** in PostCard — was lost once (commit 709acb7 restored it)
- **handleAction optimistic updates** — field name mismatches cause silent post-action failures (fixed commit 51603ee)
- **Trial countdown banners and upgrade wall** — added post-bd63e93; any rewrite of `page.tsx` must preserve these
- **AI agent buttons** (inbox-agent, settings-agent) — added post-bd63e93; do not remove

---

## Knowledge Pack Maintenance Rule

After every session that changes Scout, update at minimum:
- `project_social_listener.md` — add the new commit hash + description to Recent Commit History; update Outstanding Issues
- `feedback_scout_airtable_schema.md` — if any Airtable fields were confirmed or refuted
- Any other file whose documented facts changed

This is what prevents future sessions from re-learning the same lessons.
