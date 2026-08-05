# v4-migration-ux — nav pill + badges review round v1

Branch `v4-migration-ux` (PR #15086) on localhost:3000, dark + light, 1440×900.
All shots reflect the final state after the live-tuning session of 2026-07-17.

## Pairs (each exists as -dark and -light)

| # | Shot | What to check |
|---|------|---------------|
| 01 | nav-pill-expanded | "Action required" pill: orange dot, chevron, full width + gutter, border-input hairline, 9px left inner padding |
| 02 | nav-collapsed | pill correctly absent in icon-mode sidebar |
| 03 | delay-badge-resting | Tracing title row: "New data in ~15 min", inherited (non-white) text, ring-input |
| 04 | delay-badge-hover | expanded copy "…Update your SDK for real-time data.", text goes white on hover |
| 05 | migration-panel | side panel opened from the pill |
| 06 | evals-popup | modal on /evals — light-mode bg was transparent (stale Turbopack cache missing --modal token; fixed by server restart + .next clear) |
| 07 | homepage-project-chip | org-overview "Update" chip restyled to match badge anatomy (orange dot, ring-input, inherit text) |
| 08 | status-page | /v4-migration full-page |
| 09 | badges-border-contrast | wide shot: nav pill + delay badge together on tracing |

## Decisions taken during the round

- Border/ring on all three elements = `border-input`/`ring-input` (matches the tracing search bar box; `border-border-contrast` was tried and rejected as too strong, plain `--border` as too faint).
- Dot color = Tailwind `orange-400` stand-in; tokenize as `--light-orange`/`--dark-orange` pair if kept.
- Badge/chip text inherits (60% grey in context), goes `text-foreground` on hover.
