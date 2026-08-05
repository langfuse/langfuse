# Pulse strip — y axis (v1)

Branch `pulse-strip-y-axis` (worktree `.claude/worktrees/pulse-strip-y-axis`), uncommitted.

The strip had no vertical scale reference — bar magnitude was hover-only. Added
horizontal value gridlines + labels:

- `prepareOutlierYTicks` in `lib/binning.ts` (preparer, per charts manifesto):
  walks a 1-2-5 nice-value ladder top-down from the max, maps each candidate
  through the same sqrt/linear scale as the bars, keeps ticks only where a 9px
  label fits (≥14px apart, ≥10px above the baseline), caps at 3.
- `OutlierBarStrip.tsx` renders them: full-width gridlines at 0.07 opacity
  behind the bars (matching the vertical time ticks), right-aligned mono labels
  in muted-foreground with a background-colored halo, drawn after the bars.

Mid-round feedback applied: labels are sans-serif (not mono) and sit on the
LEFT edge, per Trang.

1. `01-cost-labels-cramped-first-pass.png` — first pass: top label flipped below
   its line, second sat above its line → the two converged into a cramped stack.
2. `02-cost-labels-below-gridline.png` — fix: every label hangs below its own
   gridline; line spacing is label spacing. (Still mono + right side here.)
3. `03-latency-bursty-week.png` — latency mode, week range ("20s" / "5s").
4. `04-real-app-empty-range.png` — real observations page before seeding
   ("No events in range" state, no ticks — correct).
5. `05-real-app-seeded-left-sans.png` — final: real page, `outlier-traffic`
   seed, labels left + sans-serif.
6. `06-strip-closeup-left-sans.png` — final close-up of the strip.

7. `07-strip-no-vertical-lines.png` — vertical time gridlines removed (and the
   briefly-added left y-axis line removed too, per follow-up feedback): only
   horizontal chrome remains.
8. `08-cost-final-sans-no-verticals.png` — final cost mode; x labels also sans.
9. `09-latency-final-duration-ticks.png` — final latency mode: y ticks on the
   duration ladder ("30s"/"10s", scales to "1m"/"5m"), values ≥1m format
   compound ("1m 31s") via `formatCompoundDuration` in the strip registry
   (app-wide latencyFormatter untouched — Intl can't do compound units).

10. `10-cost-trimmed-dollars.png` — cost values drop trailing zeros ("$10",
    "$2", "$0.5") on ticks and tooltips alike; sub-minute latency stays
    decimal seconds ("3.3s") per Trang (asked twice, confirmed).

1–3 from Storybook `playground-outlierbarstrip--*`; 4–10 from the local app
(light mode).
