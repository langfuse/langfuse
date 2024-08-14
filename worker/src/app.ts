import "./sentry"; // this is required to make instrumentation work
import express from "express";
import cors from "cors";
import * as Sentry from "@sentry/node";
import * as middlewares from "./middlewares";
import api from "./api";
import MessageResponse from "./interfaces/MessageResponse";

require("dotenv").config();

import logger from "./logger";

import { evalJobCreator, evalJobExecutor } from "./queues/evalQueue";
import { batchExportJobExecutor } from "./queues/batchExportQueue";
import { flushIngestionQueueExecutor } from "./queues/ingestionFlushQueue";
import { repeatQueueExecutor } from "./queues/repeatQueue";
import { logQueueWorkerError } from "./utils/logQueueWorkerError";
import { onShutdown } from "./utils/shutdown";

import helmet from "helmet";

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

// The error handler must be before any other error middleware and after all controllers
app.use(Sentry.expressErrorHandler());

app.use(middlewares.notFound);
app.use(middlewares.errorHandler);

logger.info("Eval Job Creator started", evalJobCreator?.isRunning());
logger.info("Eval Job Executor started", evalJobExecutor?.isRunning());
logger.info(
  "Batch Export Job Executor started",
  batchExportJobExecutor?.isRunning()
);
logger.info("Repeat Queue Executor started", repeatQueueExecutor?.isRunning());
logger.info(
  "Flush Ingestion Queue Executor started",
  flushIngestionQueueExecutor?.isRunning()
);

evalJobCreator?.on("failed", logQueueWorkerError);
evalJobExecutor?.on("failed", logQueueWorkerError);
batchExportJobExecutor?.on("failed", logQueueWorkerError);
repeatQueueExecutor?.on("failed", logQueueWorkerError);
flushIngestionQueueExecutor?.on("failed", logQueueWorkerError);

process.on("SIGINT", () => onShutdown("SIGINT"));
process.on("SIGTERM", () => onShutdown("SIGTERM"));

export default app;
