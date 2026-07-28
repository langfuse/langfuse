# v4-migration-ux PR round 1 (2026-07-28)

Before = origin/main (4deb6bc20), after = v4-migration-ux branch.
Local dev, demo user (v4UpgradeUi flag), demo-app project, 1440x900.

Pairs:

- 01-org-overview-banner: agent-tools banner → v4 announcement banner
  (Check status + Docs, dismissible 7d).
- 02-panel-header: old "Review v4 migration" header + button row →
  "Migrate X to v4" title with Migration Status link, intro copy explaining
  v4, V3/V4 Preview toggle row with data-model-linked description, Documentation
  link on the details header.
- 03-panel-cta-step2 (after only): two-step CTA, prompt revealed with
  "Copy prompt" button. Before had a single-click "Copy prompt for agents"
  (visible in 02-before).
- 04-status-page: hero card with "Update all with agents" CTA → CTA removed.
