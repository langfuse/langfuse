import * as Sentry from "@sentry/nextjs";

const isEuOrUsRegionNonHipaa =
  process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined
    ? ["EU", "US"].includes(process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION)
    : false;

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  release: process.env.NEXT_PUBLIC_BUILD_ID,

  // Replay may only be enabled for the client-side
  integrations: [
    Sentry.replayIntegration({
      maskAllText: !isEuOrUsRegionNonHipaa,
      blockAllMedia: !isEuOrUsRegionNonHipaa,
    }),
    Sentry.browserTracingIntegration(),
    Sentry.httpClientIntegration(),
    // Sentry.debugIntegration(),
    Sentry.captureConsoleIntegration({
      levels: ["error"],
    }),
    Sentry.browserProfilingIntegration(),
  ],

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: process.env.NEXT_PUBLIC_LANGFUSE_TRACING_SAMPLE_RATE
    ? Number(process.env.NEXT_PUBLIC_LANGFUSE_TRACING_SAMPLE_RATE)
    : 0,

  // Capture Replay for 100% of all sessions,
  // plus for 100% of sessions with an error
  replaysSessionSampleRate: process.env.NEXT_PUBLIC_LANGFUSE_TRACING_SAMPLE_RATE
    ? Number(process.env.NEXT_PUBLIC_LANGFUSE_TRACING_SAMPLE_RATE)
    : 0,
  replaysOnErrorSampleRate: 1.0,
  debug: false,

  // Set profilesSampleRate to 1.0 to profile every transaction.
  // Since profilesSampleRate is relative to tracesSampleRate,
  // the final profiling rate can be computed as tracesSampleRate * profilesSampleRate
  // For example, a tracesSampleRate of 0.5 and profilesSampleRate of 0.5 would
  // result in 25% of transactions being profiled (0.5*0.5=0.25)
  profilesSampleRate: 0.5,
  // ...

  // Note: if you want to override the automatic release value, do not set a
  // `release` value here - use the environment variable `SENTRY_RELEASE`, so
  // that it will also get attached to your source maps
});
