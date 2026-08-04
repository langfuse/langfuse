# Feature Preview modal redesign — round v1

Branch: `feature-preview-modal-redesign` (worktree `.claude/worktrees/feature-preview-modal`).
Files: `web/src/features/feature-previews/components/FeaturePreviewModal.tsx`,
`FeaturePreviewModal.stories.tsx`. `ControlledFeaturePreviewModal.tsx` untouched
(no shared markup; behavior unchanged).

## Screenshots

Pairs share a number; before = old design, after = redesign. All dialog-element
shots at 1440x900, real app on localhost:3003 (demo user) unless marked storybook.

- `01-before/after-light-disabled` — light mode, Compact Session View off.
- `02-before-dark-disabled` / `02-after-dark-enabled` — dark mode. Toggle state
  differs between the pair because toggling flips real user state; I finished
  with the flag ON (the demo user's original state, restored via the new UI —
  which also verified the mutation end-to-end).
- `03-before-light-enabled-fullpage` — old design in page context (viewport shot).
- `03-after-light-enabled` — new design, enabled (green badge).
- `04/05-*-storybook` — new `MultipleFeatures` story: two sidebar rows with
  switches; 05 shows selection switched to the second (disabled) feature and the
  full "added … · updated …" metadata line.
- `06-after-light-warning-storybook` — warning banner unchanged in new layout.

## Layout mapping (mock → codebase conventions)

- Header: standard `DialogHeader`/`DialogTitle` ("Feature Preview" + X). Dropped
  the subtitle sentence per the mock.
- Sidebar rows: feature name (text-sm font-bold; `font-medium` rejected by the
  repo lint rule `@repo/no-raw-font-weight`) + design-system `Switch` on the
  right; selected row `bg-muted`, hover `bg-muted/50`, `rounded-md`. Toggling a
  row's switch also selects it.
- Status badge: existing `Badge` variants — `success` ("Enabled") /
  `secondary` ("Disabled"). Sentence case instead of the mock's ALL CAPS, per
  existing badge usage.
- Metadata line: `font-mono text-xs text-muted-foreground`. Dates are REAL, from
  git history of each registry entry (modernSession added 2026-07-20 in
  #15190; searchBar added 2026-06-17 #14237, updated 2026-06-18 GA #14340),
  stored as optional static `dates` fields. "updated" renders only when present.
- Divider: `border-t border-dashed border-border` before the actions.
- Dropped the bespoke `sm:rounded-2xl` / `shadow-2xl` / `bg-background`
  overrides on DialogContent — now the stock `bg-modal` dialog with standard
  radii. Illustration panel `rounded-2xl shadow-inner` → `rounded-md border`.

## Judgment calls / deviations from the mock

- Kept the illustration panel and the long "details" paragraph (between the
  metadata line and the dashed divider). The mock omits them, but deleting
  existing product content felt out of scope for a restyle; easy to remove.
- Warning banner kept (not in the mock) — it carries gating information
  (v4-beta requirement / env-forced flags).
- Port 3001 was occupied by another session's dev server; used 3003.
- Known pre-existing quirk (unchanged): toggling a preview closes the modal
  because `authSession.update()` remounts the layout.
