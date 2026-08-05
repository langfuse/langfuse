# Sessions view — v5 mock fidelity round 1 (style-v5-fidelity-v1)

Branch `sessions-view-r2`, state: **turn 1 selected, gpt-4o-completion
inspector open, 1600×900** — same state as the handoff's acceptance
screenshots (`design_handoff_sessions_view 3/screenshots/`).

## Files

- `01-side-by-side-light-mock-top-impl-bottom.png` — mock (top) vs implementation (bottom)
- `01-side-by-side-dark-mock-top-impl-bottom.png` — same, dark
- `impl-light-1600x900.png` / `impl-dark-1600x900.png` — raw captures
- `app-impact-{traces,dashboards,settings}-{light,dark}.png` — the app-wide
  change ledger (below) on three other surfaces
- `GAPS.md` — every remaining visible difference, tagged

## ⚠ FONTS — needs your review

- **Geist Mono is now ADOPTED app-wide** (it is OFL/free). Loaded via
  `next/font` in `web/src/styles/fonts.ts`, declared on `:root` from `_app`,
  prepended to the `--font-mono` stack — exactly the deferred-font plan the
  repo documented in globals.css. Every mono surface in the app (numerals,
  IDs, code, eyebrows, tables) now renders Geist Mono in both themes.
  **Revert = delete fonts.ts + the `_app` style tag + the one stack line.**
- **F37 Analog is NOT included** — it is a commercial font; the display/title
  faces fall back to the app's sans stack (same fallback the mock's static
  captures show). Send the license/files and we wire it the same way.

## App-wide change ledger (visible beyond the sessions page)

| Change | Old → New | Where visible |
| --- | --- | --- |
| `--font-mono` stack | ui-monospace… → **Geist Mono**, ui-monospace… | every mono text app-wide |
| `--header` (light) | near-white `210 40% 98%` → paper `60 14% 96%` (#F6F6F3) | page headers everywhere |
| `--header` (dark) | `60 8% 3.5%` → `60 7% 8.4%` (#171714, mock base chrome) | page headers everywhere |
| `--sidebar-background` (light) | white → paper #F6F6F3 (+ accent/border retuned) | sidenav |
| `--sidebar-background` (dark) | `60 8% 3.5%` → `60 6% 6.7%` (#121210 recessed) | sidenav |
| Page header | shadow removed; 44px→40px top row; ItemBadge → mono uppercase type eyebrow; title 18px→21px | every detail/list page |
| EnvLabel (DEV/PROD chip) | green/red pill → neutral mono chip (prod keeps red text) | top bar (cloud only) |
| `EyebrowLabel` | 9px bold 0.08em → 10px regular 0.05em | trace + session detail panels |
| `ZoneDivider` | 8px muted band → 1px dashed hairline | trace + session detail panels |
| `OverviewGrid`/`OverviewRow` | inline label:value 4-col, 11px bold → stacked label-over-value 2-col cells, 13px mono | trace peek + session inspector |
| `UsageBadge` token format | `917 prompt → 435 completion (∑ 1,352)` → `917 → 435 (∑ 1,352)` (long form kept in tooltip/title) | trace peek + session inspector |
| Scores accordion | quiet "+ Add score" text → "Add score" bordered header button; empty copy reworded | trace peek + session inspector |
| Code-well tokens (new) | — → `--session-code-well*` (dark I/O frames in BOTH themes) | session inspector (only consumer today) |

All token edits are marked `/* PROPOSED (review) */` in `globals.css` with the
previous values inline.

## Capture caveats

- The traces-table impact screenshots show an empty table ("Past 1 day" —
  seeded data is older) and had a toast hidden: the local ClickHouse schema
  is missing `ingestion_sdk_name`, so `events.getSdkVersionInfo` errors on
  this machine. Pre-existing environment drift, unrelated to this branch.
- The mock's F37 Analog display face falls back to sans in BOTH the mock's
  static captures and our implementation, so the side-by-sides compare like
  for like.
