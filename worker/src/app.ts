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
} from "./queues/evalQueue";
import { batchExportQueueProcessor } from "./queues/batchExportQueue";
import { onShutdown } from "./utils/shutdown";
import helmet from "helmet";
import { cloudUsageMeteringQueueProcessor } from "./queues/cloudUsageMeteringQueue";
import { WorkerManager } from "./queues/workerManager";
import {
  CoreDataS3ExportQueue,
  DataRetentionQueue,
  MeteringDataPostgresExportQueue,
  PostHogIntegrationQueue,
  QueueName,
  logger,
  BlobStorageIntegrationQueue,
  DeadLetterRetryQueue,
  IngestionQueue,
} from "@langfuse/shared/src/server";
import { env } from "./env";
import { ingestionQueueProcessorBuilder } from "./queues/ingestionQueue";
import { BackgroundMigrationManager } from "./backgroundMigrations/backgroundMigrationManager";
import { experimentCreateQueueProcessor } from "./queues/experimentQueue";
import { traceDeleteProcessor } from "./queues/traceDelete";
import { projectDeleteProcessor } from "./queues/projectDelete";
import {
  postHogIntegrationProcessingProcessor,
  postHogIntegrationProcessor,
} from "./queues/postHogIntegrationQueue";
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

if (env.QUEUE_CONSUMER_TRACE_UPSERT_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(
    QueueName.TraceUpsert,
    evalJobTraceCreatorQueueProcessor,
    {
      concurrency: env.LANGFUSE_TRACE_UPSERT_WORKER_CONCURRENCY,
    },
  );
}

if (env.QUEUE_CONSUMER_CREATE_EVAL_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(
    QueueName.CreateEvalQueue,
    evalJobCreatorQueueProcessor,
    {
      concurrency: env.LANGFUSE_EVAL_CREATOR_WORKER_CONCURRENCY,
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
      limiter: {
        // Process at most one PostHog job globally per 10s.
        max: 1,
        duration: 10_000,
      },
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

process.on("SIGINT", () => onShutdown("SIGINT"));
process.on("SIGTERM", () => onShutdown("SIGTERM"));

export default app;
