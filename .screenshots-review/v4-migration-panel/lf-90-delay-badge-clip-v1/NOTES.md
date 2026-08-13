# LF-90 — delay badge hover text clipped (v1)

Ticket: https://linear.app/clickhouse/issue/LF-90/fix-text-is-cut-of-for-data-delay-badge

Root cause: the hover-expanded description in `V4MigrationBadgeContent` animated
`max-w-0 → max-w-96` (384px hard cap). The longest copy variant (OTel:
". Your setup is outdated. Update OTel instrumentation for real-time data.")
measures 403px at text-xs bold, so `overflow-hidden` clipped the tail ("ta.").

Fix: animate `grid-template-columns: 0fr → 1fr` instead — expands to the
intrinsic text width for any copy length, no magic number.

Shots (badge on /traces of seeded llm-app, OTel copy swapped in via DOM to
reproduce the longest variant — local seed only shows the SDK variant, 310px,
which never clipped):

1. `01-before-hover-otel-copy-clipped.png` — hover, text cut at "real-time da"
2. `02-after-hover-otel-copy-full.png` — hover, full sentence + chevron visible
3. `03-after-collapsed-unchanged.png` — idle state unchanged ("New data in ~15 min")

Measurements: before — container 384px vs text 403px (clipped: true);
after — container 403px = text 403px (clipped: false).
