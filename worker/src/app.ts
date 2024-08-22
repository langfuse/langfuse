import express from "express";
import cors from "cors";
import * as middlewares from "./middlewares";
import api from "./api";
import MessageResponse from "./interfaces/MessageResponse";

require("dotenv").config();

import logger from "./logger";

import { evalJobCreator, evalJobExecutor } from "./queues/evalQueue";
import { batchExportJobExecutor } from "./queues/batchExportQueue";
import { ingestionQueueExecutor } from "./queues/ingestionFlushQueueExecutor";
import { repeatQueueExecutor } from "./queues/repeatQueue";
import { logQueueWorkerError } from "./utils/logQueueWorkerError";
import { onShutdown } from "./utils/shutdown";

import helmet from "helmet";
import { legacyIngestionExecutor } from "./queues/legacyIngestionQueue";
import { cloudUsageMeteringJobExecutor } from "./queues/cloudUsageMeteringQueue";

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

logger.info("Eval Job Creator started", evalJobCreator?.isRunning());

logger.info("Eval Job Executor started", evalJobExecutor?.isRunning());
logger.info(
  "Batch Export Job Executor started",
  batchExportJobExecutor?.isRunning()
);
logger.info("Repeat Queue Executor started", repeatQueueExecutor?.isRunning());
logger.info(
  "Flush Ingestion Queue Executor started",
  ingestionQueueExecutor?.isRunning()
);
logger.info(
  "Legacy Ingestion Executor started",
  legacyIngestionExecutor?.isRunning()
);
logger.info(
  "Cloud Usage Metering Job Executor started",
  cloudUsageMeteringJobExecutor?.isRunning()
);

evalJobCreator?.on("failed", logQueueWorkerError);
evalJobExecutor?.on("failed", logQueueWorkerError);
batchExportJobExecutor?.on("failed", logQueueWorkerError);
repeatQueueExecutor?.on("failed", logQueueWorkerError);
ingestionQueueExecutor?.on("failed", logQueueWorkerError);
legacyIngestionExecutor?.on("failed", logQueueWorkerError);
cloudUsageMeteringJobExecutor?.on("failed", logQueueWorkerError);

process.on("SIGINT", () => onShutdown("SIGINT"));
process.on("SIGTERM", () => onShutdown("SIGTERM"));

export default app;
