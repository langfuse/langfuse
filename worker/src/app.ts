import express from "express";
import cors from "cors";
import * as middlewares from "./middlewares";
import api from "./api";
import MessageResponse from "./interfaces/MessageResponse";

require("dotenv").config();

import {
  evalJobCreatorQueueProcessor,
  evalJobExecutorQueueProcessor,
} from "./queues/evalQueue";
import { batchExportQueueProcessor } from "./queues/batchExportQueue";
import { ingestionFlushQueueProcessor } from "./queues/ingestionFlushQueueExecutor";
import { repeatQueueProcessor } from "./queues/repeatQueue";
import { onShutdown } from "./utils/shutdown";

import helmet from "helmet";
import { legacyIngestionQueueProcessor } from "./queues/legacyIngestionQueue";
import { cloudUsageMeteringQueueProcessor } from "./queues/cloudUsageMeteringQueue";
import { WorkerManager } from "./queues/workerManager";
import { QueueName } from "@langfuse/shared/src/server";
import { env } from "./env";

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

if (env.QUEUE_CONSUMER_REPEAT_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(QueueName.RepeatQueue, repeatQueueProcessor);
}

if (env.QUEUE_CONSUMER_TRACE_UPSERT_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(QueueName.TraceUpsert, evalJobCreatorQueueProcessor, {
    concurrency: env.LANGFUSE_EVAL_CREATOR_WORKER_CONCURRENCY,
  });
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

if (env.QUEUE_CONSUMER_INGESTION_FLUSH_QUEUE_IS_ENABLED === "true") {
  WorkerManager.register(
    QueueName.IngestionFlushQueue,
    ingestionFlushQueueProcessor,
    {
      concurrency: env.LANGFUSE_INGESTION_FLUSH_PROCESSING_CONCURRENCY,
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

process.on("SIGINT", () => onShutdown("SIGINT"));
process.on("SIGTERM", () => onShutdown("SIGTERM"));

export default app;
