# Pulse outlier strip — simplify (PR #15540)

- PR: https://github.com/langfuse/langfuse/pull/15540
- Before baseline: commit `187686a1e` (main before the PR branch), served locally on port 3002
- After: PR branch served on port 3001
- Viewport: 1280x720 (default, no emulation), light mode
- Page: `/project/7a88fb47-b4e2-43b8-a06c-a5ce950dc53a/traces?dateRange=90d` (seeded demo data, ends 2026-07-22)

## Shots

| # | File | What it shows |
|---|------|---------------|
| 1/2 | `1-strip-overview-before.png` / `2-strip-overview-after.png` | Strip header: mono 11px "Cost · max" + X close button → sans 13px "Cost" dropdown, no X |
| 3/4 | `3-drag-band-before.png` / `4-drag-band-after.png` | Mid-drag selection band (pointerdown at 55% width, pointermove to 72%) |
| 5/6 | `5-tooltip-before.png` / `6-tooltip-after.png` | Hover tooltip on a data bar (~66% width); cost value also shows max → sum default ($0.003 max vs $23.77 sum for the same bucket) |

## Measured changes

| Aspect | Before (187686a1e) | After (PR #15540) |
|--------|--------------------|-------------------|
| Drag band fill | 0.12 opacity, no edges | 0.18 opacity + 1px edge lines at 0.55 |
| Trigger label font | mono 11px ("Cost · max") | sans 13px ("Cost") |
| Tooltip font | mono | sans 11px |
| Cost metric options | max (default) / sum | sum only |
| Latency metric options | max (default) / p95 / avg | p95 (default) / p50 |
| Tokens + Split modes | present | removed |
| X close / reopen affordance | present | removed (strip always on) |
| Cursor over strip | default | crosshair |
| Strip top margin | mt-1 | mt-2 |
