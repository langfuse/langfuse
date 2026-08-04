# v4 delay badge on Experiments page — round 1

Date: 2026-07-22
Branch: v4-migration-ux (PR #15086)
Change: `web/src/pages/project/[projectId]/experiments/index.tsx` — added
`titleBadges: <V4MigrationDelayBadge />` to the page header, mirroring the
Tracing and Observations pages.

Setup: local dev server, demo@langfuse.com, `v4UpgradeUi` feature flag enabled
for the demo user in Postgres, seeded `llm-app` project.

## Screenshots

1. `01-experiments-badge-default.png` — "New data in ~15 min" pill with orange
   dot next to the "Experiments" title.
2. `02-experiments-badge-hover.png` — hover expands to "…Update your SDK for
   real-time data."
3. `03-experiments-badge-panel-open.png` — clicking the badge opens the
   "Migrate llm-app to v4" side panel.
