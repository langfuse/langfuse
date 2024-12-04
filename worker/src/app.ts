import "./initialize";

import express from "express";
import cors from "cors";
import * as middlewares from "./middlewares";
import api from "./api";
import MessageResponse from "./interfaces/MessageResponse";

require("dotenv").config();

import {
  evalJobDatasetCreatorQueueProcessor,
  evalJobExecutorQueueProcessor,
  evalJobTraceCreatorQueueProcessor,
} from "./queues/evalQueue";
import { batchExportQueueProcessor } from "./queues/batchExportQueue";
import { onShutdown } from "./utils/shutdown";

import helmet from "helmet";
import { legacyIngestionQueueProcessor } from "./queues/legacyIngestionQueue";
import { cloudUsageMeteringQueueProcessor } from "./queues/cloudUsageMeteringQueue";
import { WorkerManager } from "./queues/workerManager";
import { QueueName, logger } from "@langfuse/shared/src/server";
import { env } from "./env";
import { ingestionQueueProcessor } from "./queues/ingestionQueue";
import { BackgroundMigrationManager } from "./backgroundMigrations/backgroundMigrationManager";
import { experimentCreateQueueProcessor } from "./queues/experimentQueue";
import { traceDeleteProcessor } from "./queues/traceDelete";

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
      concurrency: env.LANGFUSE_EVAL_CREATOR_WORKER_CONCURRENCY,
    },
  );
}

if (env.QUEUE_CONSUMER_TRACE_DELETE_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(QueueName.TraceDelete, traceDeleteProcessor, {
    concurrency: env.LANGFUSE_TRACE_DELETE_CONCURRENCY,
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

if (env.QUEUE_CONSUMER_INGESTION_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(QueueName.IngestionQueue, ingestionQueueProcessor, {
    concurrency: env.LANGFUSE_INGESTION_QUEUE_PROCESSING_CONCURRENCY,
  });
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
    },
  );
}

if (env.QUEUE_CONSUMER_LEGACY_INGESTION_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(
    QueueName.LegacyIngestionQueue,
    legacyIngestionQueueProcessor,
    { concurrency: env.LANGFUSE_LEGACY_INGESTION_WORKER_CONCURRENCY }, // n ingestion batches at a time
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

process.on("SIGINT", () => onShutdown("SIGINT"));
process.on("SIGTERM", () => onShutdown("SIGTERM"));

export default app;
