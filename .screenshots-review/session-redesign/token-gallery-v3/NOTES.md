# token-gallery-v3 (2026-07-27)

Round for PR #15500 (branch `storybook-design-docs`) after two changes on top
of v2:

1. Layering model section moved from the Color page to the Layout page
   (commit 23257e43f), placed right before Overlay layers.
2. Copy-trim pass: minimal, curt blurbs and ledes across all four pages;
   duplicated typeface guidance paragraphs removed; "Two weights,
   deliberately" retitled "Weight roles" (commit 89ea4c4dd).

All shots are full-page captures of the story iframe at 1440px width from the
local Storybook (:6006, `storybook-docs` worktree), values as parsed from this
branch's `globals.css` (main tokens; v5 theme lands via #15418).

| # | Page | Theme |
|---|------|-------|
| sb-01 | Design → Color | light |
| sb-02 | Design → Color | dark |
| sb-03 | Design → Typography | light |
| sb-04 | Design → Typography | dark |
| sb-05 | Design → Layout | light |
| sb-06 | Design → Layout | dark |
| sb-07 | Design → Charts | light |
| sb-08 | Design → Charts | dark |

Same files pushed to the `pr-15500-assets` branch and embedded in the PR
description.

Addendum: sb-07/sb-08 re-captured after review round 2 renamed the Charts
"Sequential scale" section to "Score base colors" and removed the misleading
heatmap-intensity sample (commit 4742c30b7). The other shots are unaffected
by rounds 1-3 (Color's exclusion rewrite and the parser fixes render
identically; the Layout animations changes sit inside the collapsed
Animations section).
