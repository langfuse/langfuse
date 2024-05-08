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

import { evalJobCreator, evalJobExecutor } from "./redis/consumer";
import helmet from "helmet";

const app = express();

const isSentryEnabled = String(env.SENTRY_DSN) !== undefined;

if (isSentryEnabled) {
  Sentry.init({
    dsn: String(env.SENTRY_DSN),
    integrations: [
      // enable HTTP calls tracing
      new Sentry.Integrations.Http({ tracing: true }),
      // enable Express.js middleware tracing
      new Sentry.Integrations.Express({ app }),
      nodeProfilingIntegration(),
      Sentry.metrics.metricsAggregatorIntegration(),
    ],
    // Performance Monitoring
    tracesSampleRate: 0.1, //  Capture 100% of the transactions
    // Set sampling rate for profiling - this is relative to tracesSampleRate
    profilesSampleRate: 0.1,
    sampleRate: 0.1,
  });

  // The request handler must be the first middleware on the app
  app.use(Sentry.Handlers.requestHandler());

  // TracingHandler creates a trace for every incoming request
  app.use(Sentry.Handlers.tracingHandler());
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
  app.use(Sentry.Handlers.errorHandler());
}
app.use(middlewares.notFound);
app.use(middlewares.errorHandler);

logger.info("Eval Job Creator started", evalJobCreator?.isRunning());

logger.info("Eval Job Executor started", evalJobExecutor?.isRunning());

evalJobCreator?.on("failed", (job, err) => {
  logger.error(err, `Eval Job with id ${job?.id} failed with error ${err}`);
});

evalJobCreator?.on("failed", (job, err) => {
  logger.error(
    err,
    `Eval execution Job with id ${job?.id} failed with error ${err}`
  );
});

export default app;
