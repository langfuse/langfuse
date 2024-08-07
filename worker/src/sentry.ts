import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { env } from "./env";

require("dd-trace").init({
  profiling: true,
  runtimeMetrics: true,
});

Sentry.init({
  dsn: String(env.SENTRY_DSN),
  integrations: [
    Sentry.httpIntegration(),
    Sentry.expressIntegration(),
    nodeProfilingIntegration(),
    Sentry.redisIntegration(),
    Sentry.prismaIntegration(),
  ],

  // Add Tracing by setting tracesSampleRate
  // We recommend adjusting this value in production
  tracesSampleRate: env.LANGFUSE_TRACING_SAMPLE_RATE,

  // Set sampling rate for profiling
  // This is relative to tracesSampleRate
  profilesSampleRate: 0.1,
});
