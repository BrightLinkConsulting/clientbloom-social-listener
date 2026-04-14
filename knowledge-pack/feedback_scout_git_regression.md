---
name: Scout — Git regression pattern and prevention
description: How clobbering happens in Scout's codebase and the workflow that prevents it
type: feedback
---

Never edit page.tsx or settings/page.tsx based on a version that was read from disk earlier in a session without first doing a fresh git pull.

**Why:** The b8a2f4a reliability commit built its version of page.tsx on top of a base that was missing intermediate commits (ee6732e logo, eb00dc0 CRM tab, e2ccd15 countdown). When pushed, it silently overwrote those features. We then spent a full session restoring them. The same thing happened again with the Team tab (790d067) getting clobbered by the same stale base. The same pattern also caused a divergent branch situation in April 2026 session 4 where the local /tmp/sl-check had a different commit than origin.

**How to apply:** Always work from the `/tmp/sl-check` GitHub clone. Before making ANY edits:
1. `cd /tmp/sl-check && git stash && git pull --rebase origin main && git stash pop`
2. Read the file fresh AFTER the pull — never use a read from earlier in the session
3. Make the smallest possible targeted edit (use Edit tool, not full Write/rewrite)
4. Commit and push immediately after each logical change — don't batch changes across files and push once

If the /tmp/sl-check clone is missing or stale, re-clone from:
`https://ghp_YOUR_PAT_HERE@github.com/BrightLinkConsulting/clientbloom-social-listener.git`

Git identity for this repo: `git config user.email "twp1996@gmail.com" && git config user.name "Mike Walker"`

**Commit message format**: Always use a HEREDOC with Co-Authored-By: Claude Sonnet 4.6 footer.

**Divergent branch recovery** (when git pull fails with "branches have diverged"):
```
git stash
git pull --rebase
git stash pop
```
If there are unstaged changes that block the stash: `git stash` first, then `git pull --rebase`, then `git stash pop`.

**Feature branch recommendation**: For multi-file changes, use a feature branch + PR so GitHub diffs are visible before merge and revert is a single button click. Mike is interested in this workflow when ready.

## Session Continuity — Preventing Regression Across Sessions

Context compression at the end of long sessions is a known risk. When a conversation summarizes and a new session starts, Claude gets a condensed version of history — and previously working features can get unknowingly overwritten by edits that were based on outdated understanding.

**Rules to prevent this:**
1. At the start of every Scout session, re-read all Scout memory files (MEMORY.md index + key files) before touching any code
2. Never assume the /tmp/sl-check files match the last known state — always git pull first
3. When making edits to large files (page.tsx, settings/page.tsx), read the FULL file fresh from disk after git pull, then make targeted edits with the Edit tool — never reconstruct or rewrite from memory
4. After every commit, immediately update the relevant memory file with what changed and what commit hash it was
5. If a session summary says "feature X was fixed in commit ABC" — verify the feature still works in the current HEAD before touching related code
