import express from "express";
import cors from "cors";
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

import * as middlewares from "./middlewares";
import api from "./api";
import MessageResponse from "./interfaces/MessageResponse";
import { env } from "./env";

require("dotenv").config();

import { evalJobCreator, evalJobExecutor } from "./redis/consumer";

const app = express();

const isSentryEnabled = Boolean(env.SENTRY_DSN);

if (isSentryEnabled) {
  Sentry.init({
    dsn: String(env.SENTRY_DSN),
    integrations: [
      // enable HTTP calls tracing
      new Sentry.Integrations.Http({ tracing: true }),
      // enable Express.js middleware tracing
      new Sentry.Integrations.Express({ app }),
      nodeProfilingIntegration(),
    ],
    // Performance Monitoring
    tracesSampleRate: 1.0, //  Capture 100% of the transactions
    // Set sampling rate for profiling - this is relative to tracesSampleRate
    profilesSampleRate: 1.0,
  });

  // The request handler must be the first middleware on the app
  app.use(Sentry.Handlers.requestHandler());

  // TracingHandler creates a trace for every incoming request
  app.use(Sentry.Handlers.tracingHandler());
}

app.use(cors());
app.use(express.json());
app.get<{}, MessageResponse>("/", (req, res) => {
  res.json({
    message: "🦄🌈✨👋🌎🌍🌏✨🌈🦄",
  });
});

app.use("/api/v1", api);

if (isSentryEnabled) {
  // The error handler must be before any other error middleware and after all controllers
  app.use(Sentry.Handlers.errorHandler());
}
app.use(middlewares.notFound);
app.use(middlewares.errorHandler);

console.log("Eval Job Creator started", evalJobCreator.isRunning());

console.log("Eval Job Executor started", evalJobExecutor.isRunning());

evalJobCreator.on("failed", (job, err) => {
  console.log(`Job failed with error ${err}`);
});

evalJobExecutor.on("completed", (job) => {
  console.log(`Job completed`);
});

evalJobCreator.on("failed", (job, err) => {
  console.log(`Job failed with error ${err}`);
});

evalJobCreator.on("completed", (job) => {
  console.log(`Job completed`);
});

export default app;
