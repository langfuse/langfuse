# Datadog Query Playbook

The default for this skill is the **broad sweep**: APM spans + logs + metrics
+ monitors + incidents, run against both EU and US sites unless intake clearly
localizes. Cluster results before drilling in.

Two MCP servers are typically connected — one for `datadoghq.eu`, one for
`datadoghq.com`. Run the same query on both and compare. The contrast itself
is often the most informative finding (e.g. LFE-9475's 23.5% EU vs 0.7% US
error rate immediately ruled out PostHog Cloud as the global cause).

## Tag Vocabulary

- **Site:** `datadoghq.eu` for EU, `datadoghq.com` for US.
- **Region tag (`env`):** `prod-eu`, `prod-us`, `prod-hipaa`, `prod-jp`.
- **Service:** `worker` (default in `worker/src/env.ts`) or `web` (default in
  `web/src/env.mjs`). Some deployments override to `langfuse`.
- **Span resource names** for worker async jobs follow the pattern
  `process <queue-name>` — see `repo-debug-map.md`.

## 1. APM Span Sweep — find the failing handler

Use `aggregate_spans` first; only fetch individual traces once a cluster is
identified.

Starter shape (rename the resource for the relevant subsystem):

```text
service:worker resource_name:"process posthog-integration-project" status:error
```

Aggregations to run, in order:

1. Count by `env` — confirms region split.
2. Count by `error.message` — primary error classes.
3. Count by `(projectId, error.message)` — which tenants are affected, by
   class. `projectId` lives on span tags as `@projectId` for log search and as
   a tag for spans (depends on instrumentation site).
4. p50 / p95 / p99 duration by region — fingerprints timeouts vs. crashes vs.
   slow successes.

If `aggregate_spans` returns no results, check:

- the resource name is right (case-sensitive, see `repo-debug-map.md`);
- the time window covers when the issue was actually firing;
- the region tag matches reality (the EU MCP only sees EU traces).

### Public API tenant / legacy-endpoint usage

For tenant-specific public API route usage, use
[`../../datadog-query-recipes/references/public-api-tenant-usage.md`](../../datadog-query-recipes/references/public-api-tenant-usage.md).
The key gotcha is that tenant tags usually live on the `api-auth-verify` child
span while the HTTP route lives on the request root span, so correlate by
`traceid` rather than relying on one combined span filter.

## 2. Log Sweep — read what the handler said

Logs are the right tool for *messages* the handler emitted. Spans are the
right tool for *which handler invocations failed*.

Starter shapes:

```text
service:worker env:prod-eu @projectId:cm1r6u1iq00ccfvrkoy8vg3ms status:error
service:worker env:prod-eu "[POSTHOG]" status:error
```

Useful log facets:

- `@projectId` or `@langfuse.project.id` — Langfuse project (cuid).
- `@error.kind` / `@error.message` / `@error.stack` — when the Winston logger
  serialized an Error.
- `@queue` / `@jobName` — when set by BullMQ instrumentation.

For high-volume subsystems (`ingestion-queue`, `otel-ingestion-queue`),
prefer `analyze_datadog_logs` with grouping over `search_datadog_logs` — the
raw matches are too noisy.

## 3. Metric Sweep — confirm the trend

Pick 2–3 metrics that match the subsystem. Common ones:

- `trace.bullmq.process.errors` and `trace.bullmq.process.duration` —
  per-queue health from the BullMQ OTel instrumentation. Filter by
  `resource_name:"process <queue-name>"`.
- `trace.http_request.errors` and `trace.http_request.duration` for HTTP
  handlers (`service:web`).
- ClickHouse: cluster-level `clickhouse.query.duration`,
  `clickhouse.memory_usage` — the worker doesn't emit these directly, they
  come from the `clickhouse` integration in the infra repo.
- Postgres: `aurora.databaseconnections`, `aurora.deadlocks` — relevant when
  the symptom is `connection_limit` / `connection pool` errors.

If the subsystem isn't already known, run `search_datadog_metrics` for the
subsystem name and pick the obvious counter / gauge / histogram triplet.

## 4. Monitors & Incidents

- `search_datadog_monitors` for the subsystem name — tells you what alerts
  *would* have fired and what their thresholds are. A muted monitor on the
  affected subsystem is itself a finding (see LFE-9475: "EU alert muted for
  a week").
- `search_datadog_incidents` for the time window — links any pre-existing
  incident the user may not have referenced.

## 5. RUM / Frontend (only when the symptom is user-facing)

Skip unless the issue is "page broken" / "slow load". Then:

- `search_datadog_rum_events` filtered by `@view.url:` patterns matching the
  affected route.
- Cross-reference with `service:web` API errors at the same time.

## 6. Trace Drill-Down

Once a cluster is identified, fetch one or two representative traces with
`get_datadog_trace` to read the actual stack and confirm where in the handler
the throw originates. This is what lets you point at a specific file and
line range in the analysis.

## Anti-Patterns

- Don't fetch individual logs/traces before aggregating. You'll burn context
  on noise and miss the cluster pattern.
- Don't trust a single-region query as global. Always compare EU and US.
- Don't read an `error.message` literally if it goes through a custom error
  wrapper — `validateWebhookURL` rejections, for example, are re-logged as
  "DNS lookup failed" but are actually validator rejections.
- Don't assume monitors are firing just because errors exist — check if the
  monitor is muted.

## Linking Out

End the analysis with the actual Datadog UI URLs you queried, e.g.:

```text
https://app.datadoghq.eu/apm/traces?query=resource_name%3A%22process+posthog-integration-project%22+status%3Aerror
https://app.datadoghq.com/apm/traces?query=resource_name%3A%22process+posthog-integration-project%22+status%3Aerror
```

so the human reader can re-run the same query.
