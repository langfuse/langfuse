# Export staleness

Scheduled integrations (blob, PostHog, Mixpanel) emit one sample per enabled
integration on every scheduler tick. Provenance: LFE-16783.

## Metric

- Name: `langfuse.export.staleness_seconds`
- Type: distribution
- Value: `now − lastSyncAt` (seconds, clamped at 0), where `lastSyncAt` is the
  export watermark (newest exported timestamp)
- Emitted by the `handle*IntegrationSchedule` cron, not by the export job, so:
  - every enabled integration contributes one sample per tick, which makes
    percentiles time-weighted rather than run-weighted;
  - an integration that stops running keeps emitting a rising value, so a
    stall surfaces within one tick (blob: 20 min; PostHog/Mixpanel: 1 h).
- Steady-state floor is the lag buffer (blob 20 min, PostHog/Mixpanel 30 min)
  plus up to one export interval.
- Integrations that have never synced (`lastSyncAt` null) are skipped.
- Tags: `integration` (`blob_storage` / `posthog` / `mixpanel`), `window`
  (`20m` / `1h` / `1d` / `1w`; `unknown` for an unrecognised blob frequency),
  `unit:seconds`. `env` comes from the agent. **No `project_id`.**
- PostHog and Mixpanel are tagged `window:1h` (hourly cron). Blob uses the
  configured cadence.

## Queries (both Datadog sites)

EU (`prod-eu`) and US (`prod-us`, `prod-hipaa`, `prod-jp`):

```text
p95:langfuse.export.staleness_seconds{*} by {integration,window,env}
max:langfuse.export.staleness_seconds{*} by {integration,window}
```

Normalise by cadence when comparing windows: a `1w` blob export is healthy at
~1 week of staleness.

## Emit sites

- `worker/src/features/blobstorage/handleBlobStorageIntegrationSchedule.ts`
- `worker/src/features/posthog/handlePostHogIntegrationSchedule.ts`
- `worker/src/features/mixpanel/handleMixpanelIntegrationSchedule.ts`
- Helper: `worker/src/services/exportStalenessMetric.ts`
