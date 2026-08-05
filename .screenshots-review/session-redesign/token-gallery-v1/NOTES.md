# Token gallery v1 — Inter adoption + Storybook Theme Tokens gallery

Branch: `app-theme-v5` (PR #15418), worktree `theme-split`.

## Inter adoption (`feat(ui): adopt Inter for the sans typescale`)

- 01-before-inter-session-light.png — session_50 page, light, system sans (before)
- 02-before-inter-session-dark.png — session_50 page, dark, system sans (before)
- 03-after-inter-session-light.png — session_50 page, light, Inter (after)
- 04-after-inter-session-dark.png — session_50 page, dark, Inter (after)
- 05-after-inter-traces-light.png — traces table, light, Inter (after; empty state
  is the 1-day time filter, not a regression — layout check)
- 06-after-inter-traces-dark.png — traces table, dark, Inter (after)

Verified on :3013: body computes to Inter (loaded via next/font, `--font-inter`
declared on :root from _app), mono surfaces still Geist Mono, bold role renders
600 in Inter (no weight-role retune needed).

## Storybook "Design/Theme Tokens" gallery

- 07-gallery-light-full.png — full gallery, light theme (toolbar switcher)
- 08-gallery-dark-full.png — full gallery, dark theme
- 09-gallery-proposed-badge-closeup-light.png — `--background` card: PROPOSED
  badge with old → new swatches (light)
- 10-gallery-proposed-badge-closeup-dark.png — same card under dark

Gallery parses `web/src/styles/globals.css` as raw text at build time (no
hand-maintained token list). Summary line reports: 87 themed tokens ·
13 proposed in light · 25 proposed in dark · 2 proposed font tokens.

## Housekeeping

The 8 extra files in this folder (accordion/metadata/`01-session-light` etc.)
are strays from an earlier trace-view round that were accidentally swept in by
a copy glob; the permission classifier blocked removing them. Safe to delete —
they duplicate the earlier round's folder.
