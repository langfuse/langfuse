# Repo Debug Map — Subsystem → Code → Datadog Filters

For each subsystem we ship monitors and incidents on, this is the canonical
map between the symptom, the Datadog query that surfaces it, and the source
files where the bug almost certainly lives.

When intake gives you a subsystem (PostHog, evals, exports, etc.), start
here to pick the right Datadog filters and the right files to read.

## Worker Async Jobs

Worker handlers are wrapped by `instrumentAsync` in their queue file. The
span resource name follows the pattern `process <queue-name>`. Queue and job
name constants live in
`packages/shared/src/server/queues.ts`
(`QueueName` and `QueueJobs` enums).

| Subsystem | Queue file | Handler dir | Span `resource_name` | Log prefix |
| --- | --- | --- | --- | --- |
| PostHog integration | `worker/src/queues/postHogIntegrationQueue.ts` | `worker/src/features/posthog/` | `process posthog-integration-project` | `[POSTHOG]` |
| Mixpanel integration | `worker/src/queues/mixpanelIntegrationQueue.ts` | `worker/src/features/mixpanel/` | `process mixpanel-integration-project` | `[MIXPANEL]` |
| Blob storage export | `worker/src/queues/blobStorageIntegrationQueue.ts` | `worker/src/features/blobstorage/` | `process blob-storage-project` | `[BLOBSTORAGE]` |
| Data retention | `worker/src/queues/dataRetentionQueue.ts` | `worker/src/features/batch-data-retention-cleaner/` | `process data-retention-project` | n/a |
| Event propagation | `worker/src/queues/eventPropagationQueue.ts` | `worker/src/features/eventPropagation/` | `process event-propagation` | n/a |
| Cloud usage metering | `worker/src/queues/cloudUsageMeteringQueue.ts` | `worker/src/ee/` (cloud-only) | `process cloud-usage-metering` | n/a |
| Free-tier usage threshold | `worker/src/queues/cloudFreeTierUsageThresholdQueue.ts` | `worker/src/ee/usageThresholds/` | `process cloud-free-tier-usage-threshold` | n/a |
| Ingestion (single event) | `worker/src/queues/ingestionQueue.ts` | `worker/src/features/ingestion/` (and `IngestionService`) | BullMQ default span | n/a |
| OTel ingestion | `worker/src/queues/otelIngestionQueue.ts` | `worker/src/features/otel/` | BullMQ default span | n/a |
| Evaluation execution | `worker/src/queues/evalQueue.ts` | `worker/src/features/evaluation/` | BullMQ default span | n/a |
| Batch export | `worker/src/queues/batchExportQueue.ts` | `worker/src/features/batchExport/` | BullMQ default span | n/a |
| Webhook delivery | `worker/src/queues/webhooks.ts` | `worker/src/features/webhooks/` | BullMQ default span | n/a |
| Trace / score / dataset / project delete | `worker/src/queues/{traceDelete,scoreDelete,datasetDelete,projectDelete}.ts` | `worker/src/features/traces/`, `…/scores/`, `…/datasets/` | BullMQ default span | n/a |

For queues using BullMQ default spans (no `instrumentAsync` wrapper), search
APM with `service:worker operation_name:bullmq.process` filtered by
`bullmq.queue:<queue-name>`. For queue inventory, sharded queue naming, and
queue metric recipes, use
[`../../datadog-query-recipes/references/queue-consumers.md`](../../datadog-query-recipes/references/queue-consumers.md).

## Web (Next.js / tRPC / public API)

| Subsystem | Code | Span / log filter |
| --- | --- | --- |
| Public REST API | `web/src/pages/api/public/**` | Request span: `service:web resource_name:"GET /api/public/<path>"`; tenant span: `resource_name:api-auth-verify` with `@langfuse.project.id` / `@langfuse.org.id` |
| tRPC procedures | `web/src/server/api/routers/**` | `service:web resource_name:"POST /api/trpc/<router>.<proc>"` |
| Auth / API key verification | `web/src/features/public-api/server/apiAuth.ts` | look for `verifyAuthHeaderAndReturnScope` spans |
| Stripe billing | `web/src/ee/features/billing/server/stripeBillingService.ts` | wrapped in `instrumentAsync`; spans named after the method |

For tenant-specific public API usage questions, first query
`resource_name:api-auth-verify` by `@langfuse.project.id` or
`@langfuse.org.id`, then open representative trace IDs and inspect the request
root span for `http.path_group`, `http.route`, and `http.target`. The tenant
tags and endpoint path are usually on different spans, so a single-span query
combining both may return no results even when the trace proves usage.
For the full reusable recipe, use
[`../../datadog-query-recipes/references/public-api-tenant-usage.md`](../../datadog-query-recipes/references/public-api-tenant-usage.md).

## Shared Layers

These are not subsystems on their own, but are *frequently the actual cause*
behind a worker subsystem failure.

| Layer | Location | Common failure modes |
| --- | --- | --- |
| ClickHouse access | `packages/shared/src/server/clickhouse/`, `packages/shared/src/server/repositories/` | OOM (`Code: 241`), buffer cancel (`Code: 734`), JOIN spills, slow queries on un-pre-filtered traces |
| Prisma access | `packages/shared/src/db.ts` and per-feature repos | `connection pool timeout` (worker default `connection_limit=5`), N+1 queries |
| Queue contracts | `packages/shared/src/server/queues.ts` | wrong queue name, missing schema validation |
| Logger / instrumentation | `packages/shared/src/server/logger.ts`, `packages/shared/src/server/instrumentation.ts` | log silently dropped because `LANGFUSE_LOG_LEVEL` set wrong, or span missing because handler doesn't call `instrumentAsync` |
| Webhook URL validation | `packages/shared/src/server/validateWebhookURL.ts` | rejects with messages that *look* like DNS errors but are SSRF guard rejections |
| Encryption | `packages/shared/encryption` | bad keys → 403/auth-style failures masquerading as upstream errors |

## Common Symptoms → First Files To Read

- **"403 from upstream":** check the per-integration credentials table in
  Postgres (`PostHogIntegration`, `BlobStorageIntegration`, `WebhookConfig`,
  etc.) and the encryption layer.
- **"Timeout":** check the SDK timeout default and the per-stream
  flush/batch size in the handler. Worker async jobs default to long-running
  but the upstream SDK does not.
- **"DNS lookup failed":** distinguish actual DNS from `validateWebhookURL`
  rejection. The error message wrapping is misleading on purpose.
- **"Cannot write to canceled buffer" (CH):** ClickHouse stream wasn't
  aborted when the downstream consumer threw. Look for an `AbortController`
  threaded through the handler.
- **"Connection pool timeout" (Prisma):** worker `connection_limit` is set
  in the connection string; jobs doing per-row `findFirst()` exhaust it.
  Check whether the integration row could be cached in closure scope.
- **"memory limit exceeded" (CH):** look for unbounded JOINs without a
  pre-filter CTE, especially in analytics integrations.
- **"Header overflow":** Node HTTP parser's default 80 KB ceiling. Either
  raise `--max-http-header-size` for the worker, or replace the SDK's HTTP
  client.

## Where to Look for Already-Shipped Fixes

Before recommending a patch, confirm it isn't already merged or in flight:

- `attachments` on the Linear issue (PRs and commits are auto-linked).
- `git log --oneline --since=<recent-window> -- <handler-path>`.
- Open PRs touching the file via `gh pr list --search "<filename>"`.
