# Export freshness lag

Scheduled integrations (blob, PostHog, Mixpanel) emit a pooled distribution at
the end of each run. Provenance: the shape from LFE-15853.

## Metric

- Name: `langfuse.export.freshness_lag_seconds`
- Type: distribution
- Value: `runStartTime − maxExportedTimestamp` (seconds, clamped at 0)
- Watermark: `lastSyncAt` after a successful window (`maxTimestamp` just
  written). Failing runs use the **unchanged** watermark so stall shows as
  rising lag. Do not treat intended window end as the watermark.
- Tags: `integration` (`blob_storage` / `posthog` / `mixpanel`), `window`
  (`20m` / `1h` / `1d` / `1w`), `status` (`success` / `failure`), `unit:seconds`.
  `env` comes from the agent. **No `project_id`.**
- PostHog and Mixpanel are tagged `window:1h` (hourly cron). Blob uses the
  configured cadence.

## Baseline P95 (both Datadog sites)

EU (`prod-eu`) and US (`prod-us`, `prod-hipaa`, `prod-jp`):

```text
p95:langfuse.export.freshness_lag_seconds{*} by {integration,window,env}
```

Split success vs failure while baselining:

```text
p95:langfuse.export.freshness_lag_seconds{*} by {integration,window,status}
```

Catch-up (historic backfill) sits in the tail. P95 is the planned SLI **if**
those runs stay under ~5% of pooled volume. If they do not, filter runs whose
target window is older than N× the cadence (follow-up, not this metric).

## Emit sites

- `worker/src/features/blobstorage/handleBlobStorageIntegrationProjectJob.ts`
- `worker/src/features/posthog/handlePostHogIntegrationProjectJob.ts`
- `worker/src/features/mixpanel/handleMixpanelIntegrationProjectJob.ts`
- Helper: `worker/src/services/exportFreshnessLagMetric.ts`
