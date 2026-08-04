# V4 migration modal — close button overlap (v1)

Branch `v4-panel-close-overlap` (worktree `.claude/worktrees/v4-panel-close-overlap`), uncommitted.

Root cause: `DialogContent` renders a floating fallback close button at the
body's top-right whenever the dialog has no `DialogHeader` — the migration
modal's title is `sr-only`, so the X landed on the right-aligned "Migration
Status" link in `V4MigrationHeaderContent`.

Final fix (after two design iterations with Trang): link stays right-aligned
(justify-between), copy is "View Status", and the MODAL passes a
`titleRowClassName="pr-6"` gutter so the link clears the floating X. The side
panel (own header row, never overlapped) passes nothing and is unchanged.

1. `01-before-x-overlaps-link.png` — Trang's report: X clipping "Migration
   Status" (dark mode, prod-like).
2. `02-after-view-status-inline.png` — iteration 1 (inline next to title);
   Trang preferred right-aligned.
3. `03-final-view-status-right-gutter.png` — final: right-aligned "View
   Status" + modal gutter.

Test: V4MigrationContent.clienttest.tsx pins the copy, href, and gutter
pass-through.
