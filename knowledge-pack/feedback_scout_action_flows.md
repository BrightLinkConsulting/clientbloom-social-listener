---
name: Scout — Action flow state machine and known bugs
description: Complete mapping of how post actions (Engage, Replied, Skip, CRM, Archive) work in Airtable fields, optimistic UI, and tab routing — including bugs that have been fixed and patterns to never break
type: feedback
---

## The Action State Machine

Every post has two Airtable fields that together determine its state:
- `Action` — the primary bucket: `'New' | 'Engaged' | 'Skipped' | 'CRM'`
- `Engagement Status` — sub-state modifier: `'' | 'replied' | 'archived'`

**Tab → field mapping:**
| Feed Tab | Action value | Engagement Status value |
|---|---|---|
| Inbox (New) | 'New' | '' |
| Engaged | 'Engaged' | '' |
| Replied | 'Engaged' | 'replied' |
| Skipped | 'Skipped' | '' |
| In CRM | 'CRM' | '' |
| Archived | any | 'archived' |

## What the PATCH route writes for each action

`/api/posts/[id]/route.ts` — action handling (as of commit bd63e93):

```
action='Engaged' → fields.Action='Engaged', fields['Engagement Status']=''
action='Skipped' → fields.Action='Skipped', fields['Engagement Status']=''
action='New'     → fields.Action='New',     fields['Engagement Status']=''
action='CRM'     → fields.Action='CRM',     fields['Engagement Status']=''
action='Replied' → fields.Action='Engaged', fields['Engagement Status']='replied'
action='Archived'→ fields['Engagement Status']='archived'  (Action unchanged)
```

**CRITICAL — fields that do NOT exist in Captured Posts:**
- `Engaged By` — was in the code but NEVER existed in Airtable. Caused UNKNOWN_FIELD_NAME 422 error that silently broke the Engage button. Removed in commit bd63e93.
- Never add `Engaged By` back without first creating the field manually in Airtable UI.

## Optimistic UI State in page.tsx

When a user clicks an action button, `handleAction` does:
1. PATCH the server
2. On success, update local post state immediately (optimistic)
3. After 500ms, remove the post from the current filter tab (so it disappears from the wrong tab)

**Correct local field mappings after each action:**
```
action='Replied'  → set post.fields.Action='Engaged', post.fields['Engagement Status']='replied'
action='Archived' → keep existing Action, set post.fields['Engagement Status']='archived'
action='Engaged'  → set post.fields.Action='Engaged', post.fields['Engagement Status']=''
action='Skipped'  → set post.fields.Action='Skipped', post.fields['Engagement Status']=''
action='CRM'      → set post.fields.Action='CRM',     post.fields['Engagement Status']=''
```

**Bug that was fixed (commit 51603ee):** The optimistic update was setting `Action='Replied'` and `Action='Archived'` in local state, which didn't match how Airtable stores them. This caused the tab filter to mismatch — posts didn't appear in the right tabs after clicking the action button.

## Tab Count Tracking (countKey helper)

The feed shows per-tab counts. When a post moves, the count for the old tab decrements and the new tab increments.

The `countKey(action, engStatus)` helper maps a post's current Airtable state to its current tab name:
```typescript
const countKey = (a: string, es: string) =>
  a === 'Engaged' && es === 'replied' ? 'Replied'
  : a === 'Engaged'                   ? 'Engaged'
  : a
```

**Bug that was fixed:** Count decrement was using the raw `Action` field, which returned 'Engaged' for Replied-state posts. This meant the Engaged count decremented instead of the Replied count when a post was moved out of the Replied tab.

## Error Surfacing Pattern (as of commit 51603ee)

The `handleAction` function now has an `actionError` state that shows a red dismissable banner if the API returns a non-2xx response. The banner shows the raw error message from the API response body.

```tsx
const [actionError, setActionError] = useState<string | null>(null)
```

If the Engage button ever appears to do nothing again, the first debugging step is to check whether a red error banner appears. If it does, the message will show the exact Airtable error (e.g., UNKNOWN_FIELD_NAME).

## Why These Bugs Keep Happening

When large files like page.tsx get edited across sessions, the optimistic update logic and field mappings are in the same 300-line function. If that function gets partially reconstructed from memory (rather than edited with the Edit tool from a fresh read), the field names used in `setPosts` can silently diverge from what the server writes. Always use targeted Edit operations on `handleAction` — never rewrite it from scratch.
