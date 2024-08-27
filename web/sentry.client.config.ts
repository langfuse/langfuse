import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Replay may only be enabled for the client-side
  integrations: [
    Sentry.replayIntegration(),
    // Sentry.debugIntegration(),
    Sentry.captureConsoleIntegration({
      levels: ["error"],
    }),
  ],

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: process.env.NEXT_PUBLIC_LANGFUSE_TRACING_SAMPLE_RATE
    ? Number(process.env.NEXT_PUBLIC_LANGFUSE_TRACING_SAMPLE_RATE)
    : 0.5,

  // Capture Replay for 100% of all sessions,
  // plus for 100% of sessions with an error
  replaysSessionSampleRate: process.env.NEXT_PUBLIC_LANGFUSE_TRACING_SAMPLE_RATE
    ? Number(process.env.NEXT_PUBLIC_LANGFUSE_TRACING_SAMPLE_RATE)
    : 0.5,
  replaysOnErrorSampleRate: 1.0,
  debug: false,

  beforeSend(event, _hint) {
    // Check if it is an exception, and if so, show the report dialog
    if (event.exception) {
      Sentry.showReportDialog({ eventId: event.event_id });
    }
    return event;
  },

  // ...

  // Note: if you want to override the automatic release value, do not set a
  // `release` value here - use the environment variable `SENTRY_RELEASE`, so
  // that it will also get attached to your source maps
});
