import express from "express";
import cors from "cors";
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

import * as middlewares from "./middlewares";
import api from "./api";
import MessageResponse from "./interfaces/MessageResponse";
import { env } from "./env";

require("dotenv").config();

import logger from "./logger";

import { evalJobCreator, evalJobExecutor } from "./queues/evalQueue";
import { batchExportJobExecutor } from "./queues/batchExportQueue";
import { repeatQueueExecutor } from "./queues/repeatQueue";
import helmet from "helmet";

const app = express();

const isSentryEnabled = String(env.SENTRY_DSN) !== undefined;

if (isSentryEnabled) {
  Sentry.init({
    dsn: String(env.SENTRY_DSN),
    integrations: [
      Sentry.httpIntegration(),
      Sentry.expressIntegration(),
      nodeProfilingIntegration(),
      Sentry.redisIntegration(),
    ],

    tracesSampleRate: 0.01, //  Capture 100% of the transactions

    profilesSampleRate: 0.01,
    sampleRate: 0.1,
  });

  logger.info("Sentry enabled");
}

app.use(helmet());
app.use(cors());
app.use(express.json());
app.get<{}, MessageResponse>("/", (req, res) => {
  res.json({
    message: "Langfuse Worker API 🚀",
  });
});

app.use("/api", api);

if (isSentryEnabled) {
  // The error handler must be before any other error middleware and after all controllers
  app.use(Sentry.expressErrorHandler());
}
app.use(middlewares.notFound);
app.use(middlewares.errorHandler);

logger.info("Eval Job Creator started", evalJobCreator?.isRunning());
logger.info("Eval Job Executor started", evalJobExecutor?.isRunning());
logger.info(
  "Batch Export Job Executor started",
  batchExportJobExecutor?.isRunning()
);
logger.info("Repeat Queue Executor started", repeatQueueExecutor?.isRunning());

evalJobCreator?.on("failed", (job, err) => {
  logger.error(err, `Eval Job with id ${job?.id} failed with error ${err}`);
});

evalJobExecutor?.on("failed", (job, err) => {
  logger.error(
    err,
    `Eval execution Job with id ${job?.id} failed with error ${err}`
  );
});

batchExportJobExecutor?.on("failed", (job, err) => {
  logger.error(
    err,
    `Batch Export Job with id ${job?.id} failed with error ${err}`
  );
});

repeatQueueExecutor?.on("failed", (job, err) => {
  logger.error(
    err,
    `Repeat Queue Job with id ${job?.id} failed with error ${err}`
  );
});

export default app;
