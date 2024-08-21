import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://44c5a8d22f44a2d2a7d6c780c6377a5c@o4505408450789376.ingest.us.sentry.io/4505408525565952",
  // Replay may only be enabled for the client-side
  integrations: [
    Sentry.replayIntegration(),
    Sentry.replayIntegration({
      // Additional SDK configuration goes in here, for example:
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for tracing.
  // We recommend adjusting this value in production
  tracesSampleRate: 1.0,

  // Capture Replay for 10% of all sessions,
  // plus for 100% of sessions with an error
  replaysSessionSampleRate: 1,
  replaysOnErrorSampleRate: 1.0,
  debug: true,

  // If the entire session is not sampled, use the below sample rate to sample
  // sessions when an error occurs.
  // ...

  // Note: if you want to override the automatic release value, do not set a
  // `release` value here - use the environment variable `SENTRY_RELEASE`, so
  // that it will also get attached to your source maps
});
