# Queue Consumers

Use this reference when a task asks which Langfuse queues exist, whether a
consumer is running, how much work a queue has, or how to query queue processor
spans.

## Source Of Truth

- Queue names and job names:
  `packages/shared/src/server/queues.ts` (`QueueName`, `QueueJobs`).
- Queue producer classes and shard naming:
  `packages/shared/src/server/redis/*.ts`.
- Worker consumer registration and feature gates:
  `worker/src/app.ts`.
- Worker consumer env vars:
  `worker/src/env.ts` (`QUEUE_CONSUMER_*_IS_ENABLED` plus feature-specific
  gates).
- Worker registration, request/error counters, wait/processing time, and
  sampled old-style depth metrics:
  `worker/src/queues/workerManager.ts`.
- Queue depth background reporter:
  `worker/src/features/queue-metrics-runner/index.ts`.
- Metric name conversion:
  `packages/shared/src/server/instrumentation/index.ts`
  (`convertQueueNameToMetricName`).
- Sharded queue registry:
  `worker/src/queues/shardedQueueRegistry.ts`.
- BullMQ tracing setup:
  `worker/src/instrumentation.ts` (`BullMQInstrumentation`).

## Queue Inventory

Current `QueueName` values:

| Queue | Notes |
| --- | --- |
| `trace-upsert` | Sharded. Registers all `TraceUpsertQueue` shards. |
| `trace-delete` | Delete traces from storage. |
| `project-delete` | Project deletion cleanup. |
| `evaluation-execution-queue` | Sharded eval execution. |
| `secondary-evaluation-execution-queue` | Sharded secondary eval execution. |
| `llm-as-a-judge-execution-queue` | Sharded observation-based eval execution. |
| `dataset-run-item-upsert-queue` | Dataset run item upserts. |
| `batch-export-queue` | Batch exports. |
| `otel-ingestion-queue` | Sharded OTel ingestion. |
| `secondary-otel-ingestion-queue` | Sharded secondary OTel ingestion. |
| `ingestion-queue` | Sharded single-event ingestion. |
| `secondary-ingestion-queue` | Sharded secondary single-event ingestion. |
| `cloud-usage-metering-queue` | Cloud-only, Stripe-gated. |
| `cloud-spend-alert-queue` | Cloud-only, Stripe-gated. |
| `cloud-free-tier-usage-threshold-queue` | Cloud-only, Stripe-gated. |
| `experiment-create-queue` | Experiment creation. |
| `posthog-integration-queue` | Schedules PostHog integration jobs. |
| `posthog-integration-processing-queue` | Processes PostHog projects. |
| `mixpanel-integration-queue` | Schedules Mixpanel integration jobs. |
| `mixpanel-integration-processing-queue` | Processes Mixpanel projects. |
| `blobstorage-integration-queue` | Schedules blob storage jobs. |
| `blobstorage-integration-processing-queue` | Processes blob storage projects. |
| `core-data-s3-export-queue` | Cloud export feature gate. |
| `metering-data-postgres-export-queue` | Cloud export feature gate. |
| `data-retention-queue` | Schedules data retention jobs. |
| `data-retention-processing-queue` | Processes data retention projects. |
| `batch-action-queue` | Batch actions. |
| `create-eval-queue` | Eval job creation. |
| `score-delete` | Score deletion cleanup. |
| `dataset-delete-queue` | Dataset deletion cleanup. |
| `dead-letter-retry-queue` | Dead letter retry worker. |
| `webhook-queue` | Webhook delivery. |
| `entity-change-queue` | Entity change propagation. |
| `event-propagation-queue` | Experiment event propagation gate. |
| `notification-queue` | Notifications. |

Sharded queues use the base queue for shard 0 and append `-1`, `-2`, etc. for
additional shards. The sharded base queues are:

- `trace-upsert`
- `evaluation-execution-queue`
- `secondary-evaluation-execution-queue`
- `llm-as-a-judge-execution-queue`
- `otel-ingestion-queue`
- `secondary-otel-ingestion-queue`
- `ingestion-queue`
- `secondary-ingestion-queue`

## Consumer Gates

Consumer registration is in `worker/src/app.ts`. Some gates register multiple
queues or every shard for a sharded queue.

| Gate | Queues registered |
| --- | --- |
| `QUEUE_CONSUMER_TRACE_UPSERT_QUEUE_IS_ENABLED` | `trace-upsert` shards |
| `QUEUE_CONSUMER_CREATE_EVAL_QUEUE_IS_ENABLED` | `create-eval-queue` |
| `LANGFUSE_S3_CORE_DATA_EXPORT_IS_ENABLED` | `core-data-s3-export-queue` |
| `LANGFUSE_POSTGRES_METERING_DATA_EXPORT_IS_ENABLED` | `metering-data-postgres-export-queue` |
| `QUEUE_CONSUMER_TRACE_DELETE_QUEUE_IS_ENABLED` | `trace-delete` |
| `QUEUE_CONSUMER_SCORE_DELETE_QUEUE_IS_ENABLED` | `score-delete` |
| `QUEUE_CONSUMER_DATASET_DELETE_QUEUE_IS_ENABLED` | `dataset-delete-queue` |
| `QUEUE_CONSUMER_PROJECT_DELETE_QUEUE_IS_ENABLED` | `project-delete` |
| `QUEUE_CONSUMER_DATASET_RUN_ITEM_UPSERT_QUEUE_IS_ENABLED` | `dataset-run-item-upsert-queue` |
| `QUEUE_CONSUMER_EVAL_EXECUTION_QUEUE_IS_ENABLED` | `evaluation-execution-queue` shards, `llm-as-a-judge-execution-queue` shards |
| `QUEUE_CONSUMER_EVAL_EXECUTION_SECONDARY_QUEUE_IS_ENABLED` | `secondary-evaluation-execution-queue` shards |
| `QUEUE_CONSUMER_BATCH_EXPORT_QUEUE_IS_ENABLED` | `batch-export-queue` |
| `QUEUE_CONSUMER_BATCH_ACTION_QUEUE_IS_ENABLED` | `batch-action-queue` |
| `QUEUE_CONSUMER_OTEL_INGESTION_QUEUE_IS_ENABLED` | `otel-ingestion-queue` shards |
| `QUEUE_CONSUMER_OTEL_INGESTION_SECONDARY_QUEUE_IS_ENABLED` | `secondary-otel-ingestion-queue` shards |
| `QUEUE_CONSUMER_INGESTION_QUEUE_IS_ENABLED` | `ingestion-queue` shards |
| `QUEUE_CONSUMER_INGESTION_SECONDARY_QUEUE_IS_ENABLED` | `secondary-ingestion-queue` shards |
| `QUEUE_CONSUMER_CLOUD_USAGE_METERING_QUEUE_IS_ENABLED` plus `STRIPE_SECRET_KEY` | `cloud-usage-metering-queue` |
| `QUEUE_CONSUMER_CLOUD_SPEND_ALERT_QUEUE_IS_ENABLED` plus `STRIPE_SECRET_KEY` | `cloud-spend-alert-queue` |
| `QUEUE_CONSUMER_FREE_TIER_USAGE_THRESHOLD_QUEUE_IS_ENABLED` plus cloud region and Stripe gates | `cloud-free-tier-usage-threshold-queue` |
| `QUEUE_CONSUMER_EXPERIMENT_CREATE_QUEUE_IS_ENABLED` | `experiment-create-queue` |
| `QUEUE_CONSUMER_POSTHOG_INTEGRATION_QUEUE_IS_ENABLED` | `posthog-integration-queue`, `posthog-integration-processing-queue` |
| `QUEUE_CONSUMER_MIXPANEL_INTEGRATION_QUEUE_IS_ENABLED` | `mixpanel-integration-queue`, `mixpanel-integration-processing-queue` |
| `QUEUE_CONSUMER_BLOB_STORAGE_INTEGRATION_QUEUE_IS_ENABLED` | `blobstorage-integration-queue`, `blobstorage-integration-processing-queue` |
| `QUEUE_CONSUMER_DATA_RETENTION_QUEUE_IS_ENABLED` | `data-retention-queue`, `data-retention-processing-queue` |
| `QUEUE_CONSUMER_DEAD_LETTER_RETRY_QUEUE_IS_ENABLED` | `dead-letter-retry-queue` |
| `QUEUE_CONSUMER_WEBHOOK_QUEUE_IS_ENABLED` | `webhook-queue` |
| `QUEUE_CONSUMER_ENTITY_CHANGE_QUEUE_IS_ENABLED` | `entity-change-queue` |
| `QUEUE_CONSUMER_EVENT_PROPAGATION_QUEUE_IS_ENABLED` plus events-table experiment gate | `event-propagation-queue` |
| `QUEUE_CONSUMER_NOTIFICATION_QUEUE_IS_ENABLED` | `notification-queue` |

## Query Consumer Spans

Start with aggregate spans on worker services:

```text
env:<env> (service:worker OR service:worker-cpu) operation_name:bullmq.process
```

Then group by `resource_name`, queue facets such as `bullmq.queue` or
`messaging.*`, and error fields. Facet names can differ between Datadog sites,
so inspect one sample span before relying on a specific facet.

Queue-specific starter query:

```text
env:<env> (service:worker OR service:worker-cpu) operation_name:bullmq.process (resource_name:"process otel-ingestion-queue" OR resource_name:"Worker.run otel-ingestion-queue" OR bullmq.queue:otel-ingestion-queue)
```

For sharded queues, query the base queue and shard suffixes:

```text
env:<env> (service:worker OR service:worker-cpu) operation_name:bullmq.process resource_name:"*otel-ingestion-queue*"
```

If a queue file wraps the handler with `instrumentAsync`, also search the
domain-specific resource name. Examples:

| Subsystem | Resource name |
| --- | --- |
| PostHog project processing | `process posthog-integration-project` |
| Mixpanel project processing | `process mixpanel-integration-project` |
| Blob storage project processing | `process blob-storage-project` |
| Data retention project processing | `process data-retention-project` |
| Event propagation | `process event-propagation` |
| Cloud usage metering | `process cloud-usage-metering` |
| Free-tier usage threshold | `process cloud-free-tier-usage-threshold` |

Useful aggregations:

- Count by `env`, `service`, and `resource_name`.
- Count by queue facet and status.
- Count by `error.type` and `error.message`.
- p50, p95, and p99 duration by queue or shard.
- Count by `messaging.bullmq.job.input.projectId` when the processor attaches
  project IDs to the current span.

## Query Queue Metrics

Metric base names come from `convertQueueNameToMetricName(queueName)`:

```text
langfuse.queue.<queue-name-with-hyphens-replaced-by-underscores-and-trailing-_queue-removed>
```

Examples:

| Queue | Metric base |
| --- | --- |
| `ingestion-queue` | `langfuse.queue.ingestion` |
| `otel-ingestion-queue` | `langfuse.queue.otel_ingestion` |
| `secondary-otel-ingestion-queue` | `langfuse.queue.secondary_otel_ingestion` |
| `evaluation-execution-queue` | `langfuse.queue.evaluation_execution` |
| `trace-upsert` | `langfuse.queue.trace_upsert` |
| `batch-export-queue` | `langfuse.queue.batch_export` |

Prefer the newer tagged metrics:

```text
<metric_base>.depth{env:<env>,type:waiting}
<metric_base>.depth{env:<env>,type:failed}
<metric_base>.depth{env:<env>,type:active}
<metric_base>.rate{env:<env>,type:request}
<metric_base>.rate{env:<env>,type:failed}
<metric_base>.rate{env:<env>,type:error}
<metric_base>.time{env:<env>,type:wait}
<metric_base>.time{env:<env>,type:processing}
```

For sharded queues, use the `shard` tag when present. `shard:all` is emitted by
the depth runner for aggregate depth across shards.

Backward-compatible metrics may still appear:

```text
<metric_base>.length
<metric_base>.dlq_length
<metric_base>.active
<metric_base>.request
<metric_base>.failed
<metric_base>.error
<metric_base>.wait_time
<metric_base>.processing_time
```

For non-BullMQ internal write buffering, `ClickhouseWriter` emits
`langfuse.queue.clickhouse_writer.*` metrics, but it is not a `QueueName`
consumer.

## Consumer Running Checklist

To establish whether a consumer is running in production:

1. Check queue depth metrics for waiting, failed, and active counts.
2. Check `rate{type:request}` or old `.request` metrics for recent processing.
3. Search BullMQ processor spans on `worker` and `worker-cpu`.
4. Search worker logs for the queue name or processor-specific log prefix.
5. If all signals are empty, verify the relevant `QUEUE_CONSUMER_*_IS_ENABLED`
   gate and any feature-specific gates in `worker/src/app.ts`.

The queue metrics runner only polls queues with registered workers. Missing
depth metrics can mean the consumer is not registered on that worker, queue
metrics are disabled, or the data is on the other Datadog site.
