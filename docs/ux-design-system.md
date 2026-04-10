# UX / Design System

> **Scout** — `scout.clientbloom.ai`
> Dark-mode SaaS dashboard. Tailwind CSS on Next.js 14. All design decisions here are the source of truth for any UI work.

---

## Typography Scale

Scout uses a two-tier text size system. Getting this right is what separates readable UI from eye-strain UI.

### The rule

| Role | Tailwind class | Size | When to use |
|------|---------------|------|-------------|
| Body / labels / instructions | `text-sm` | 14px | Any text a user actually reads: section labels, field descriptions, helper text, instructional copy, status messages, empty states, activity log entries, score reason text |
| Compact data / UI chrome | `text-xs` | 12px | Buttons, badge pills, nav items, tag chips, pagination controls, inline action links ("Done", "Cancel"), chart tooltip values, data widget micro-labels (e.g. Surfaced / Engaged / Rate under big numbers) |
| Section headings | `text-base` | 16px | Top-level section titles inside the `Section` component |
| Widget numbers | `text-xl` / `text-2xl` | 20–24px | Big stat values (engagement score, momentum counter) |
| Page headings | `text-2xl` / `text-3xl` | 24–30px | Page-level titles |

### Why the split matters

The instinct is to make everything compact and use `text-xs` widely. Resist this. Instructional text at 12px on a dark background with low-contrast slate colors becomes a readability problem, especially on non-retina displays and for users over 40. The platform is asking users to make decisions based on copy — that copy must be legible without strain.

Buttons and badge pills at 12px are fine because those are tap targets, not reading material. The user isn't parsing them, they're clicking them.

### What never changes size

These always stay `text-xs` regardless of context:
- Nav menu items and user account dropdown
- Action buttons (Save, Connect, Add, Cancel, Done)
- Badge pills and status chips (plan badges, score tier badges, "ICP" / "Keyword" source tags)
- Pagination controls ("Previous" / "Next" / "of N")
- Inline toggle links ("Reset to default", "No thanks")
- Sparkline chart internals (tooltip values, "No activity" state)
- Avatar initials
- Data widget micro-labels that sit directly below a large number in a compact widget

### Common patterns to copy

```jsx
{/* Section label — use text-sm */}
<p className="text-sm font-medium text-slate-300">What to enter here</p>

{/* Helper / instructional text — use text-sm */}
<p className="text-sm text-slate-500 leading-relaxed">
  Use 2–4 word phrases that describe the topics your ideal clients post about.
</p>

{/* Form field label — use text-sm */}
<label className="block text-sm font-medium text-slate-400">Bot OAuth Token</label>

{/* Empty state message — use text-sm */}
<p className="text-sm text-slate-500 mb-4">No profiles yet. Add one manually or use Discover.</p>

{/* Button — stays text-xs */}
<button className="text-xs px-4 py-2 rounded-lg bg-blue-600 text-white font-medium">Save</button>

{/* Badge pill — stays text-xs */}
<span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400">5/10</span>
```

---

## Color System

### Background layers (dark → light)
| Token | Usage |
|-------|-------|
| `bg-slate-950` / `bg-[#0A0C10]` | Page base — the darkest layer |
| `bg-slate-900` | Primary card/panel backgrounds |
| `bg-slate-800` / `bg-slate-800/60` | Input fields, nested cards, hover states |
| `bg-slate-700` | Selected states, secondary buttons |

### Text colors
| Token | Usage |
|-------|-------|
| `text-white` | Primary content, post titles, names |
| `text-slate-200` | Section headings, strong labels |
| `text-slate-300` | Sub-headings, secondary labels |
| `text-slate-400` | Helper text, descriptions, form labels |
| `text-slate-500` | Tertiary — timestamps, metadata, captions |
| `text-slate-600` | Quaternary — inline helpers, detail text in compact spaces |

Never go darker than `text-slate-600` for any user-facing text. `text-slate-700` is invisible on dark backgrounds.

### Score / status color system

This system is used consistently across the entire platform. When a color represents a score or status, always use the same color for that concept everywhere — in cards, badges, chart bars, dots, and text.

| Meaning | Color | Tailwind tokens |
|---------|-------|----------------|
| High-value / strong / positive | Emerald | `text-emerald-400`, `bg-emerald-500/10`, `border-emerald-500/20` |
| Active / engaged / in-progress | Blue | `text-blue-400`, `bg-blue-600/10`, `border-blue-500/30` |
| Caution / floor / threshold | Amber | `text-amber-400`, `bg-amber-500/10`, `border-amber-500/20` |
| Skipped / low-priority / inactive | Slate | `text-slate-400`, `bg-slate-800`, `border-slate-700/50` |
| Error / expired / danger | Red | `text-red-400`, `bg-red-500/10`, `border-red-500/20` |
| Premium / upgrade prompt | Violet | `text-violet-400`, `bg-violet-600/10`, `border-violet-500/30` |
| Brand accent | Indigo | `text-[#4F6BFF]`, `bg-[#4F6BFF]/20` |

#### AI Scoring threshold cards

The three scoring threshold cards in Settings → AI & Scoring use color to reinforce the score's meaning:

| Threshold | Score | Color | Rationale |
|-----------|-------|-------|-----------|
| Minimum to surface | 5/10 | Amber | Floor — caution, low bar |
| Digest inclusion | 6/10 | Blue | Active quality — worth reviewing |
| High-value flag | 8/10 | Emerald | Strong signal — top priority |

These colors must match how the same scores are displayed in the feed post cards and score badges throughout the platform.

#### Momentum / streak colors

Streak and activity indicators in the Engagement Momentum widget:

| Condition | Color | Meaning |
|-----------|-------|---------|
| Active ≥ 60% of last 7 days | Emerald | Strong consistency |
| Active 30–59% | Medium gray (`text-slate-400`) | Building |
| Active < 30% | Dark gray (`text-slate-600`) | Low activity |
| Streak dots | Amber | Draws attention without alarm |

---

## Spacing and Layout

### Card / panel pattern
```jsx
<div className="rounded-xl bg-slate-900/60 border border-slate-700/40 px-4 py-4">
  {/* content */}
</div>
```

### Section component
The `<Section>` wrapper in settings/page.tsx handles consistent padding, heading, and optional description. Always use it for top-level settings sections rather than rolling custom layout.

### Form field anatomy
```
[label — text-sm font-medium text-slate-400]
[input — text-sm bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-2.5 text-white]
[helper text — text-sm text-slate-500 leading-relaxed mt-1]
```

Input text and label text should always be the same size (`text-sm`). Mismatched sizes — where input text is visibly larger than the label above it — signals a regression and should be fixed.

---

## Interactive States

| State | Pattern |
|-------|---------|
| Default | `border-slate-700/50 text-slate-400` |
| Hover | `hover:border-slate-600 hover:text-white` |
| Active / selected | `border-blue-500/50 bg-blue-600/10 text-blue-400` |
| Disabled | `disabled:opacity-40 disabled:cursor-not-allowed` |
| Focus (input) | `focus:outline-none focus:border-blue-500/50` |
| Destructive hover | `hover:text-red-400 hover:border-red-500/40` |

---

## Callout / Info Box Patterns

Used throughout for contextual help, warnings, and upgrade prompts.

```jsx
{/* Info / how-it-works box */}
<div className="rounded-xl bg-slate-800/40 border border-slate-700/30 px-4 py-3 flex gap-3">
  <InfoIcon />
  <div>
    <p className="text-sm font-medium text-slate-300">Title</p>
    <p className="text-sm text-slate-500 leading-relaxed mt-1">Body text.</p>
  </div>
</div>

{/* Warning / amber */}
<div className="flex gap-2.5 px-3.5 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm text-amber-400">
  Warning text.
</div>

{/* Success / emerald */}
<div className="flex gap-2.5 px-3.5 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400">
  Success text.
</div>

{/* Error / red */}
<div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
  Error text.
</div>

{/* Upgrade prompt / violet */}
<div className="rounded-xl bg-violet-600/10 border border-violet-500/20 px-4 py-4">
  <p className="text-sm font-semibold text-violet-300">Available on Pro</p>
  <a href="/upgrade" className="text-xs font-semibold text-violet-400 hover:text-violet-300 underline">Upgrade →</a>
</div>
```

---

## Bulk Selection Mode

Scout's feed supports bulk actions (Skip, Archive, Restore) on multiple posts at once. The selection flow uses a specific pattern that must be preserved across future UI changes.

### How it works

1. **Entry** — User clicks the "Select" button (top-right of the tab bar, next to Refresh). The button includes a small checkbox icon as a visual affordance for what it does.
2. **Tab bar transforms in-place** — The tab strip disappears and is replaced in the same horizontal bar with: a tri-state select-all checkbox, a selected count, status feedback (working spinner / result message), and Cancel + Refresh on the right. No secondary row drops below the bar.
3. **Post cards gain a checkbox column** — A dedicated left-gutter column (40px) holds the checkbox. The score badge and card content remain in their own flex track — they never share space with the checkbox.
4. **Momentum Widget collapses** — When selection mode activates, the Engagement Momentum Widget animates to `max-h-0 / opacity-0` so the posts are visually adjacent to the selection controls. Widget re-expands when selection exits.
5. **Bottom action bar slides up** — Once ≥1 post is selected, a centered pill appears from the bottom of the screen with: Skip N / Archive N (or Restore N on the Skipped tab). It slides back down when selection clears.
6. **Completion** — After a bulk action, the success count ("43 posts updated") is shown for 1.5s in the top bar while Airtable propagates the writes and the post list refreshes silently. Then selection mode auto-exits.

### Scout Agent interaction during selection mode

- The Scout Agent floating button fades out (opacity-0, pointer-events-none) when selection mode activates — prevents z-index and pointer-events conflicts with the action bar.
- The Agent panel closes automatically if it was already open when the user enters selection mode.
- The Agent panel reopens normally once selection mode exits.

### Implementation notes

- `selectionMode: boolean` state in `page.tsx`
- `selectedIds: Set<string>` — always by Airtable record ID
- Selection state clears on tab switch (existing posts in another tab cannot be accidentally acted on)
- `handleBulkAction` sets `setBulkLoading(false)` before the 1.5s propagation wait, so the result message is visible to the user during the wait window
- Tab bar uses conditional rendering: `{selectionMode ? <SelectionBar /> : <TabStrip />}` — same container, same height, no layout shift
- Post card article element uses `flex` layout; checkbox is first flex child with `shrink-0`, content div is `flex-1 min-w-0`
- Bottom action bar: `fixed bottom-0 left-0 right-0 z-50 pointer-events-none` outer container, `pointer-events-auto` inner pill only

### What used to exist (removed — do not re-add)

- **"All" tab** — showed every post regardless of status. Removed because it was a superset of Inbox + Engaged + Replied + Skipped + In CRM with no additional utility.
- **Secondary toolbar row** — the old bulk controls appeared as an extra row below the tab bar, invisible until Select was clicked. This caused discoverability failure and visual disconnect from the post checkboxes.
- **Absolute-positioned checkbox** — `absolute top-4 left-4` overlapped the score badge dot. Replaced with flex left-column.

---

## Changelog

| Date | Change |
|------|--------|
| April 2026 | Initial design system doc created |
| April 2026 | Typography scale formalized: body/labels → `text-sm`, chrome/buttons → `text-xs` across settings/page.tsx and page.tsx (feed) |
| April 2026 | AI Scoring threshold cards color-coded: amber (5/10), blue (6/10), emerald (8/10) |
| April 2026 | Input field text size aligned with surrounding label text (both `text-sm`) |
