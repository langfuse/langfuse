# Token gallery v2 — design system docs pages

Two rounds live in this folder.

## Round 2 (current): four pages on `storybook-design-docs` (09–16)

Branch `storybook-design-docs` (off origin/main), commit
`feat(storybook): design system docs — color, typography, spacing, charts`.
Shots taken from a Storybook running that branch (port 6016), so they show
main's token values (system font stacks, pre-v5 colors) — the v5 values land
when PR #15418 merges and this branch rebases onto them.

The old Design → Theme Tokens node (gallery story, Typography deep-dive and
the hand-maintained ThemeTokens.mdx) is replaced by four single-leaf pages
directly under Design, all parsed at build time from `globals.css`, all in
the langfuse.com + Kumo docs chrome (`docsChrome.tsx`), no PROPOSED
machinery (values are approved; review scaffolding stripped):

- Token completeness: 194 tokens parsed; color 150 · typography 18 ·
  layout 12 · charts 14 · unassigned 0 (an "Unassigned tokens" group on
  Color renders any future stray).

- **Color** — Carbon-modeled layering ladder (both themes side by side),
  interaction states grounded in real app classes, dense token tables
  (token · light · dark · sample), low-traffic groups collapsed.
- **Typography** — sentence specimens with both weight roles inline,
  two-weight rows, slim scale table (specimen · token · size · full usage
  citations), mono conventions. Copy is face-agnostic so it stays truthful
  on main's system stacks.
- **Layout** — radius system with radius boxes, banner offset system with a
  mini-viewport demo, the overlay layer order (LAYER_ORDER, rendered as a
  DOM-order cascade), a breakpoints note, animations collapsed.
- **Charts** — Kumo-modeled categorical palette (numbered strip + grouped
  bars) and 5-step sequential score scale (strip + heatmap sample), grid.

| # | File | What to look at |
|---|------|-----------------|
| 09 | color-light-full | layering model, interaction states, dense token tables |
| 10 | color-dark-full | same, dark |
| 11 | typography-light-full | specimens, weights, scale, mono conventions |
| 12 | typography-dark-full | same, dark |
| 13 | layout-light-full | radii, banner offsets, overlay layer cascade, breakpoints note |
| 14 | layout-dark-full | same, dark |
| 15 | charts-light-full | categorical strip + bars, sequential scale + heatmap |
| 16 | charts-dark-full | same, dark |

## Round 1 (superseded): Theme Tokens gallery + Typography deep-dive (01–08)

Branch `app-theme-v5` at the time of the docs-voice restyle. Kept for
comparison; the structure shown here (Design → Theme Tokens → …) no longer
exists.

| # | File | What to look at |
|---|------|-----------------|
| 01 | typography-light-full | whole page, light |
| 02 | typography-dark-full | whole page, dark |
| 03 | typography-light-typefaces | Inter / Geist Mono specimens, char sets, weight roles |
| 04 | typography-light-type-scale | Carbon-style scale rows |
| 05 | typography-light-mono-conventions | eyebrow / metric / identifier / code-line samples |
| 06 | typography-dark-type-scale | scale table, dark |
| 07 | gallery-light-full | restyled token gallery, light |
| 08 | gallery-dark-full | restyled token gallery, dark |
