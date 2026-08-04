# Feature Preview modal redesign — round v2

Branch: `feature-preview-modal-redesign` (worktree `.claude/worktrees/feature-preview-modal`), PR #15348.
Follow-up round on Trang's review of v1 (see `../redesign-v1/` for the old-design
"before" shots — this round is all "after").

## Changes in this round

1. Removed the env-forced warning ("This preview is enabled by
   LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES / enabled globally…") — the banner UI
   stays, now only used for the v4-beta gating message.
2. Added a "Contact support" secondary button — same interaction as the sidebar
   Support button (closes the dialog, opens the support drawer, closes the AI
   agent panel).
3. Moved "Give feedback" + "Contact support" into the title row, right-aligned
   (`ml-auto`, `size="sm"`); dropped the bottom dashed divider + action block.
4. Removed the "added … · updated …" dates metadata line and its registry
   plumbing (`PreviewDates`, `dates` fields).

## Screenshots

All 1440x900. 01–03 real app on localhost:3003 (demo user); 04–06 Storybook
(port 6007).

- `01-after-light-enabled` — light, enabled: buttons in the title row, no dates.
- `02-after-contact-support-drawer` — state after clicking "Contact support":
  modal closed, support drawer open (browser-verified interaction).
- `03-after-dark-enabled` — dark mode.
- `04-after-light-disabled-storybook` — Default story (disabled badge). Used
  Storybook to avoid flipping the demo user's real flag.
- `05-after-multiple-features-storybook` — two sidebar rows.
- `06-after-beta-gating-warning-storybook` — Warning story now shows the real
  remaining warning (v4-beta gating) instead of the removed env-forced text.

## Judgment calls

- `disabled` logic still locks the switch when LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES
  forces a preview on — only the explanatory banner for that case was removed,
  so an env-forced user sees a locked-on switch with no explanation. Flagged to
  Trang in chat.
- Warning story got `disabled: true` to match the real beta-gating state.
