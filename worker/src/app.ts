import "./initialize";

import express from "express";
import cors from "cors";
import * as middlewares from "./middlewares";
import api from "./api";
import MessageResponse from "./interfaces/MessageResponse";

require("dotenv").config();

import {
  evalJobCreatorQueueProcessor,
  evalJobDatasetCreatorQueueProcessor,
  evalJobExecutorQueueProcessor,
  evalJobTraceCreatorQueueProcessor,
  llmAsJudgeExecutionQueueProcessor,
} from "./queues/evalQueue";
import { batchExportQueueProcessor } from "./queues/batchExportQueue";
import { onShutdown } from "./utils/shutdown";
import helmet from "helmet";
import { cloudUsageMeteringQueueProcessor } from "./queues/cloudUsageMeteringQueue";
import { cloudSpendAlertQueueProcessor } from "./queues/cloudSpendAlertQueue";
import { cloudFreeTierUsageThresholdQueueProcessor } from "./queues/cloudFreeTierUsageThresholdQueue";
import { WorkerManager } from "./queues/workerManager";
import {
  CoreDataS3ExportQueue,
  DataRetentionQueue,
  MeteringDataPostgresExportQueue,
  PostHogIntegrationQueue,
  MixpanelIntegrationQueue,
  QueueName,
  logger,
  BlobStorageIntegrationQueue,
  DeadLetterRetryQueue,
  IngestionQueue,
  OtelIngestionQueue,
  TraceUpsertQueue,
  CloudFreeTierUsageThresholdQueue,
  EventPropagationQueue,
} from "@langfuse/shared/src/server";
import { env } from "./env";
import { ingestionQueueProcessorBuilder } from "./queues/ingestionQueue";
import { BackgroundMigrationManager } from "./backgroundMigrations/backgroundMigrationManager";
import { prisma } from "@langfuse/shared/src/db";
import { ClickhouseReadSkipCache } from "./utils/clickhouseReadSkipCache";
import { experimentCreateQueueProcessor } from "./queues/experimentQueue";
import { traceDeleteProcessor } from "./queues/traceDelete";
import { projectDeleteProcessor } from "./queues/projectDelete";
import {
  postHogIntegrationProcessingProcessor,
  postHogIntegrationProcessor,
} from "./queues/postHogIntegrationQueue";
import {
  mixpanelIntegrationProcessingProcessor,
  mixpanelIntegrationProcessor,
} from "./queues/mixpanelIntegrationQueue";
import {
  blobStorageIntegrationProcessingProcessor,
  blobStorageIntegrationProcessor,
} from "./queues/blobStorageIntegrationQueue";
import { coreDataS3ExportProcessor } from "./queues/coreDataS3ExportQueue";
import { meteringDataPostgresExportProcessor } from "./ee/meteringDataPostgresExport/handleMeteringDataPostgresExportJob";
import {
  dataRetentionProcessingProcessor,
  dataRetentionProcessor,
} from "./queues/dataRetentionQueue";
import { batchActionQueueProcessor } from "./queues/batchActionQueue";
import { scoreDeleteProcessor } from "./queues/scoreDelete";
import { DlqRetryService } from "./services/dlq/dlqRetryService";
import { entityChangeQueueProcessor } from "./queues/entityChangeQueue";
import { webhookProcessor } from "./queues/webhooks";
import { datasetDeleteProcessor } from "./queues/datasetDelete";
import { otelIngestionQueueProcessor } from "./queues/otelIngestionQueue";
import { eventPropagationProcessor } from "./queues/eventPropagationQueue";
import { notificationQueueProcessor } from "./queues/notificationQueue";
import {
  BatchProjectCleaner,
  BATCH_DELETION_TABLES,
} from "./features/batch-project-cleaner";
import {
  BatchDataRetentionCleaner,
  BATCH_DATA_RETENTION_TABLES,
} from "./features/batch-data-retention-cleaner";
import { MediaRetentionCleaner } from "./features/media-retention-cleaner";
import { BatchTraceDeletionCleaner } from "./features/batch-trace-deletion-cleaner";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.get<{}, MessageResponse>("/", (req, res) => {
  res.json({
    message: "Langfuse Worker API 🚀",
  });
});

app.use("/api", api);

app.use(middlewares.notFound);
app.use(middlewares.errorHandler);

if (env.LANGFUSE_ENABLE_BACKGROUND_MIGRATIONS === "true") {
  // Will start background migrations without blocking the queue workers
  BackgroundMigrationManager.run().catch((err) => {
    logger.error("Error running background migrations", err);
  });
}

// Initialize ClickhouseReadSkipCache on container start
ClickhouseReadSkipCache.getInstance(prisma)
  .initialize()
  .catch((err) => {
    logger.error("Error initializing ClickhouseReadSkipCache", err);
  });

if (env.QUEUE_CONSUMER_TRACE_UPSERT_QUEUE_IS_ENABLED === "true") {
  // Register workers for all trace upsert queue shards
  const traceUpsertShardNames = TraceUpsertQueue.getShardNames();
  traceUpsertShardNames.forEach((shardName) => {
    WorkerManager.register(
      shardName as QueueName,
      evalJobTraceCreatorQueueProcessor,
      {
        concurrency: env.LANGFUSE_TRACE_UPSERT_WORKER_CONCURRENCY,
      },
    );
  });
}

if (env.QUEUE_CONSUMER_CREATE_EVAL_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(
    QueueName.CreateEvalQueue,
    evalJobCreatorQueueProcessor,
    {
      concurrency: env.LANGFUSE_EVAL_CREATOR_WORKER_CONCURRENCY,
      limiter: {
        // Process at most `max` jobs per `duration` milliseconds globally
        max: env.LANGFUSE_EVAL_CREATOR_WORKER_CONCURRENCY,
        duration: env.LANGFUSE_EVAL_CREATOR_LIMITER_DURATION,
      },
    },
  );
}

if (env.LANGFUSE_S3_CORE_DATA_EXPORT_IS_ENABLED === "true") {
  // Instantiate the queue to trigger scheduled jobs
  CoreDataS3ExportQueue.getInstance();
  WorkerManager.register(
    QueueName.CoreDataS3ExportQueue,
    coreDataS3ExportProcessor,
  );
}

if (env.LANGFUSE_POSTGRES_METERING_DATA_EXPORT_IS_ENABLED === "true") {
  // Instantiate the queue to trigger scheduled jobs
  MeteringDataPostgresExportQueue.getInstance();
  WorkerManager.register(
    QueueName.MeteringDataPostgresExportQueue,
    meteringDataPostgresExportProcessor,
    {
      limiter: {
        // Process at most `max` jobs per 30 seconds
        max: 1,
        duration: 30_000,
      },
    },
  );
}

if (env.QUEUE_CONSUMER_TRACE_DELETE_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(QueueName.TraceDelete, traceDeleteProcessor, {
    concurrency: env.LANGFUSE_TRACE_DELETE_CONCURRENCY,
    // Same configuration as EvaluationExecution or
    // BlobStorageIntegrationProcessingQueue queue, see detailed comment there
    maxStalledCount: 3,
    lockDuration: 60000, // 60 seconds
    stalledInterval: 120000, // 120 seconds
    limiter: {
      // Process at most `max` delete jobs per 2 min
      max: env.LANGFUSE_TRACE_DELETE_CONCURRENCY,
      duration: env.LANGFUSE_CLICKHOUSE_TRACE_DELETION_CONCURRENCY_DURATION_MS,
    },
  });
}

if (env.QUEUE_CONSUMER_SCORE_DELETE_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(QueueName.ScoreDelete, scoreDeleteProcessor, {
    concurrency: env.LANGFUSE_SCORE_DELETE_CONCURRENCY,
    limiter: {
      // Process at most `max` delete jobs per 15 seconds
      max: env.LANGFUSE_SCORE_DELETE_CONCURRENCY,
      duration: env.LANGFUSE_CLICKHOUSE_TRACE_DELETION_CONCURRENCY_DURATION_MS,
    },
  });
}

if (env.QUEUE_CONSUMER_DATASET_DELETE_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(QueueName.DatasetDelete, datasetDeleteProcessor, {
    concurrency: env.LANGFUSE_DATASET_DELETE_CONCURRENCY,
    limiter: {
      max: env.LANGFUSE_DATASET_DELETE_CONCURRENCY,
      duration:
        env.LANGFUSE_CLICKHOUSE_DATASET_DELETION_CONCURRENCY_DURATION_MS,
    },
  });
}

if (env.QUEUE_CONSUMER_PROJECT_DELETE_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(QueueName.ProjectDelete, projectDeleteProcessor, {
    concurrency: env.LANGFUSE_PROJECT_DELETE_CONCURRENCY,
    limiter: {
      // Process at most `max` delete jobs per LANGFUSE_CLICKHOUSE_PROJECT_DELETION_CONCURRENCY_DURATION_MS (default 10 min)
      max: env.LANGFUSE_PROJECT_DELETE_CONCURRENCY,
      duration:
        env.LANGFUSE_CLICKHOUSE_PROJECT_DELETION_CONCURRENCY_DURATION_MS,
    },
  });
}

if (env.QUEUE_CONSUMER_DATASET_RUN_ITEM_UPSERT_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(
    QueueName.DatasetRunItemUpsert,
    evalJobDatasetCreatorQueueProcessor,
    {
      concurrency: env.LANGFUSE_EVAL_CREATOR_WORKER_CONCURRENCY,
    },
  );
}

if (env.QUEUE_CONSUMER_EVAL_EXECUTION_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(
    QueueName.EvaluationExecution,
    evalJobExecutorQueueProcessor,
    {
      concurrency: env.LANGFUSE_EVAL_EXECUTION_WORKER_CONCURRENCY,
      // The default lockDuration is 30s and the lockRenewTime 1/2 of that.
      // We set it to 60s to reduce the number of lock renewals and also be less sensitive to high CPU wait times.
      // We also update the stalledInterval check to 120s from 30s default to perform the check less frequently.
      // Finally, we set the maxStalledCount to 3 (default 1) to perform repeated attempts on stalled jobs.
      lockDuration: 60000, // 60 seconds
      stalledInterval: 120000, // 120 seconds
      maxStalledCount: 3,
    },
  );

  // LLM-as-Judge execution for observation-level evals (uses same env flag as trace evals)
  WorkerManager.register(
    QueueName.LLMAsJudgeExecution,
    llmAsJudgeExecutionQueueProcessor,
    {
      concurrency: env.LANGFUSE_EVAL_EXECUTION_WORKER_CONCURRENCY,
      lockDuration: 60000,
      stalledInterval: 120000,
      maxStalledCount: 3,
    },
  );
}

if (env.QUEUE_CONSUMER_BATCH_EXPORT_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(QueueName.BatchExport, batchExportQueueProcessor, {
    concurrency: 1, // only 1 job at a time
    limiter: {
      // execute 1 batch export in 5 seconds to avoid overloading the DB
      max: 1,
      duration: 5_000,
    },
  });
}

if (env.QUEUE_CONSUMER_BATCH_ACTION_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(
    QueueName.BatchActionQueue,
    batchActionQueueProcessor,
    {
      concurrency: 1, // only 1 job at a time
      limiter: {
        max: 1,
        duration: 5_000,
      },
    },
  );
}

if (env.QUEUE_CONSUMER_OTEL_INGESTION_QUEUE_IS_ENABLED === "true") {
  // Register workers for all ingestion queue shards
  const shardNames = OtelIngestionQueue.getShardNames();
  shardNames.forEach((shardName) => {
    WorkerManager.register(
      shardName as QueueName,
      otelIngestionQueueProcessor,
      {
        concurrency: env.LANGFUSE_OTEL_INGESTION_QUEUE_PROCESSING_CONCURRENCY,
      },
    );
  });
}

if (env.QUEUE_CONSUMER_INGESTION_QUEUE_IS_ENABLED === "true") {
  // Register workers for all ingestion queue shards
  const shardNames = IngestionQueue.getShardNames();
  shardNames.forEach((shardName) => {
    WorkerManager.register(
      shardName as QueueName,
      ingestionQueueProcessorBuilder(true), // this might redirect to secondary queue
      {
        concurrency: env.LANGFUSE_INGESTION_QUEUE_PROCESSING_CONCURRENCY,
      },
    );
  });
}

if (env.QUEUE_CONSUMER_INGESTION_SECONDARY_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(
    QueueName.IngestionSecondaryQueue,
    ingestionQueueProcessorBuilder(false),
    {
      concurrency:
        env.LANGFUSE_INGESTION_SECONDARY_QUEUE_PROCESSING_CONCURRENCY,
    },
  );
}

if (
  env.QUEUE_CONSUMER_CLOUD_USAGE_METERING_QUEUE_IS_ENABLED === "true" &&
  env.STRIPE_SECRET_KEY
) {
  WorkerManager.register(
    QueueName.CloudUsageMeteringQueue,
    cloudUsageMeteringQueueProcessor,
    {
      concurrency: 1,
      limiter: {
        // Process at most `max` jobs per 30 seconds
        max: 1,
        duration: 30_000,
      },
    },
  );
}

// Cloud Spend Alert Queue: Only enable in cloud environment with Stripe
if (
  env.QUEUE_CONSUMER_CLOUD_SPEND_ALERT_QUEUE_IS_ENABLED === "true" &&
  env.STRIPE_SECRET_KEY
) {
  WorkerManager.register(
    QueueName.CloudSpendAlertQueue,
    cloudSpendAlertQueueProcessor,
    {
      concurrency: 20,
      limiter: {
        // Process at most 600 jobs per minute / 10 jobs per second for Stripe API rate limits
        // - stripe allows 100 ops / sec but we want to use a lower limit to account for 3 environments and other calls
        // - See: https://docs.stripe.com/rate-limits
        max: 900,
        duration: 60_000,
      },
    },
  );
}

// Free Tier Usage Threshold Queue: Only enable in cloud environment
if (
  env.QUEUE_CONSUMER_FREE_TIER_USAGE_THRESHOLD_QUEUE_IS_ENABLED === "true" &&
  env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION && // Only in cloud deployments
  env.STRIPE_SECRET_KEY
) {
  // Instantiate the queue to trigger scheduled jobs
  CloudFreeTierUsageThresholdQueue.getInstance();
  WorkerManager.register(
    QueueName.CloudFreeTierUsageThresholdQueue,
    cloudFreeTierUsageThresholdQueueProcessor,
    {
      concurrency: 1,
      limiter: {
        // Process at most `max` jobs per 30 seconds
        max: 1,
        duration: 30_000,
      },
    },
  );
}

if (env.QUEUE_CONSUMER_EXPERIMENT_CREATE_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(
    QueueName.ExperimentCreate,
    experimentCreateQueueProcessor,
    {
      concurrency: env.LANGFUSE_EXPERIMENT_CREATOR_WORKER_CONCURRENCY,
    },
  );
}

if (env.QUEUE_CONSUMER_POSTHOG_INTEGRATION_QUEUE_IS_ENABLED === "true") {
  // Instantiate the queue to trigger scheduled jobs
  PostHogIntegrationQueue.getInstance();

  WorkerManager.register(
    QueueName.PostHogIntegrationQueue,
    postHogIntegrationProcessor,
    {
      concurrency: 1,
    },
  );

  WorkerManager.register(
    QueueName.PostHogIntegrationProcessingQueue,
    postHogIntegrationProcessingProcessor,
    {
      concurrency: 1,
      // The default lockDuration is 30s and the lockRenewTime 1/2 of that.
      // We set it to 60s to reduce the number of lock renewals and also be less sensitive to high CPU wait times.
      // We also update the stalledInterval check to 120s from 30s default to perform the check less frequently.
      // Finally, we set the maxStalledCount to 3 (default 1) to perform repeated attempts on stalled jobs.
      lockDuration: 60000, // 60 seconds
      stalledInterval: 120000, // 120 seconds
      maxStalledCount: 3,
      limiter: {
        // Process at most one PostHog job globally per 10s.
        max: 1,
        duration: 10_000,
      },
    },
  );
}

if (env.QUEUE_CONSUMER_MIXPANEL_INTEGRATION_QUEUE_IS_ENABLED === "true") {
  // Instantiate the queue to trigger scheduled jobs
  MixpanelIntegrationQueue.getInstance();

  WorkerManager.register(
    QueueName.MixpanelIntegrationQueue,
    mixpanelIntegrationProcessor,
    {
      concurrency: 1,
    },
  );

  WorkerManager.register(
    QueueName.MixpanelIntegrationProcessingQueue,
    mixpanelIntegrationProcessingProcessor,
    {
      concurrency: 1,
      limiter: {
        // Process at most one Mixpanel job globally per 10s.
        max: 1,
        duration: 10_000,
      },
      // The default lockDuration is 30s and the lockRenewTime 1/2 of that.
      // We set it to 60s to reduce the number of lock renewals and also be less sensitive to high CPU wait times.
      // We also update the stalledInterval check to 120s from 30s default to perform the check less frequently.
      // Finally, we set the maxStalledCount to 3 (default 1) to perform repeated attempts on stalled jobs.
      lockDuration: 60000, // 60 seconds
      stalledInterval: 120000, // 120 seconds
      maxStalledCount: 3,
    },
  );
}

if (env.QUEUE_CONSUMER_BLOB_STORAGE_INTEGRATION_QUEUE_IS_ENABLED === "true") {
  // Instantiate the queue to trigger scheduled jobs
  BlobStorageIntegrationQueue.getInstance();

  WorkerManager.register(
    QueueName.BlobStorageIntegrationQueue,
    blobStorageIntegrationProcessor,
    {
      concurrency: 1,
    },
  );

  WorkerManager.register(
    QueueName.BlobStorageIntegrationProcessingQueue,
    blobStorageIntegrationProcessingProcessor,
    {
      concurrency: 1,
      // The default lockDuration is 30s and the lockRenewTime 1/2 of that.
      // We set it to 60s to reduce the number of lock renewals and also be less sensitive to high CPU wait times.
      // We also update the stalledInterval check to 120s from 30s default to perform the check less frequently.
      // Finally, we set the maxStalledCount to 3 (default 1) to perform repeated attempts on stalled jobs.
      lockDuration: 60000, // 60 seconds
      stalledInterval: 120000, // 120 seconds
      maxStalledCount: 3,
    },
  );
}

if (env.QUEUE_CONSUMER_DATA_RETENTION_QUEUE_IS_ENABLED === "true") {
  // Instantiate the queue to trigger scheduled jobs
  DataRetentionQueue.getInstance();

  WorkerManager.register(QueueName.DataRetentionQueue, dataRetentionProcessor, {
    concurrency: 1,
  });

  WorkerManager.register(
    QueueName.DataRetentionProcessingQueue,
    dataRetentionProcessingProcessor,
    {
      concurrency: 1,
      limiter: {
        // Process at most `max` delete jobs per LANGFUSE_CLICKHOUSE_PROJECT_DELETION_CONCURRENCY_DURATION_MS (default 10 min)
        max: env.LANGFUSE_PROJECT_DELETE_CONCURRENCY,
        duration:
          env.LANGFUSE_CLICKHOUSE_PROJECT_DELETION_CONCURRENCY_DURATION_MS,
      },
    },
  );
}

if (env.QUEUE_CONSUMER_DEAD_LETTER_RETRY_QUEUE_IS_ENABLED === "true") {
  // Instantiate the queue to trigger scheduled jobs
  DeadLetterRetryQueue.getInstance();

  WorkerManager.register(
    QueueName.DeadLetterRetryQueue,
    DlqRetryService.retryDeadLetterQueue,
    {
      concurrency: 1,
    },
  );
}

if (env.QUEUE_CONSUMER_WEBHOOK_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(QueueName.WebhookQueue, webhookProcessor, {
    concurrency: env.LANGFUSE_WEBHOOK_QUEUE_PROCESSING_CONCURRENCY,
  });
}

if (env.QUEUE_CONSUMER_ENTITY_CHANGE_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(
    QueueName.EntityChangeQueue,
    entityChangeQueueProcessor,
    {
      concurrency: env.LANGFUSE_ENTITY_CHANGE_QUEUE_PROCESSING_CONCURRENCY,
    },
  );
}

if (
  env.QUEUE_CONSUMER_EVENT_PROPAGATION_QUEUE_IS_ENABLED === "true" &&
  env.LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE === "true"
) {
  // Instantiate the queue to trigger scheduled jobs
  EventPropagationQueue.getInstance();

  WorkerManager.register(
    QueueName.EventPropagationQueue,
    eventPropagationProcessor,
    {
      concurrency: 1,
    },
  );
}

if (env.QUEUE_CONSUMER_NOTIFICATION_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(
    QueueName.NotificationQueue,
    notificationQueueProcessor,
    {
      concurrency: 5, // Process up to 5 notification jobs concurrently
    },
  );
}

// Batch project cleaners for bulk deletion of ClickHouse data
export const batchProjectCleaners: BatchProjectCleaner[] = [];

if (env.LANGFUSE_BATCH_PROJECT_CLEANER_ENABLED === "true") {
  for (const table of BATCH_DELETION_TABLES) {
    // Only start the events table cleaners if the events table experiment is enabled
    if (
      (table !== "events_full" &&
        table !== "events_core" &&
        table !== "events") ||
      env.LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE === "true"
    ) {
      const cleaner = new BatchProjectCleaner(table);
      batchProjectCleaners.push(cleaner);
      cleaner.start();
    }
  }
}

// Batch data retention cleaners for bulk deletion of expired ClickHouse data
export const batchDataRetentionCleaners: BatchDataRetentionCleaner[] = [];

if (env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_ENABLED === "true") {
  for (const table of BATCH_DATA_RETENTION_TABLES) {
    // Only start the events table cleaners if the events table experiment is enabled
    if (
      (table !== "events_full" &&
        table !== "events_core" &&
        table !== "events") ||
      env.LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE === "true"
    ) {
      const cleaner = new BatchDataRetentionCleaner(table);
      batchDataRetentionCleaners.push(cleaner);
      cleaner.start();
    }
  }
}

// Media retention cleaner for media files and blob storage
export let mediaRetentionCleaner: MediaRetentionCleaner | null = null;

if (env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_ENABLED === "true") {
  mediaRetentionCleaner = new MediaRetentionCleaner();
  mediaRetentionCleaner.start();
}

// Batch trace deletion cleaner for supplementary trace deletion
export let batchTraceDeletionCleaner: BatchTraceDeletionCleaner | null = null;

if (env.LANGFUSE_BATCH_TRACE_DELETION_CLEANER_ENABLED === "true") {
  batchTraceDeletionCleaner = new BatchTraceDeletionCleaner();
  batchTraceDeletionCleaner.start();
}

process.on("SIGINT", () => onShutdown("SIGINT"));
process.on("SIGTERM", () => onShutdown("SIGTERM"));

export default app;
