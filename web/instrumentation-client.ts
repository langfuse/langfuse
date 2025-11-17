import * as Sentry from "@sentry/nextjs";

const isEuOrUsRegionNonHipaa =
  process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined
    ? ["EU", "US"].includes(process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION)
    : false;

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  release: process.env.NEXT_PUBLIC_BUILD_ID,

  beforeSend(event, hint) {
    const error = hint.originalException;
    const errorValue = event.exception?.values?.[0]?.value || "";

    // Filter out TRPCClientErrors, we track them in DataDog.
    // The users see those via toast notifications -> see handleTrpcError in web/src/utils/api.ts
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "TRPCClientError"
    ) {
      return null;
    }

    // Filter HTTP client errors from tRPC endpoints
    // These are captured at the network level by httpClientIntegration but are already
    // handled by tRPC's error handling system
    if (
      (event.exception?.values?.[0]?.mechanism?.type === "http.client" ||
        event.exception?.values?.[0]?.mechanism?.type ===
          "auto.http.client.fetch") &&
      event.request?.url?.includes("/api/trpc/")
    ) {
      return null;
    }

    // Filter invalid href errors - these are from user-inputted data containing malformed URLs
    // The Next.js router correctly rejects them, no need to log as errors
    if (
      errorValue.includes("Invalid href") &&
      errorValue.includes("passed to next/router")
    ) {
      return null;
    }

    // Filter React DevTools internal errors - these are benign errors from DevTools
    // trying to access internal React properties
    if (errorValue.includes("__reactContextDevtoolDebugId")) {
      return null;
    }

    return event;
  },

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

  // Filter out browser extension errors
  // see: https://docs.sentry.io/platforms/javascript/configuration/filtering/#using-allowurls-and-denyurls
  denyUrls: [
    // Chrome extensions
    /chrome-extension:\/\//i,
    // Firefox extensions
    /moz-extension:\/\//i,
    // Safari extensions
    /safari-extension:\/\//i,
    // Edge extensions
    /ms-browser-extension:\/\//i,
    // Generic browser extension patterns
    /app:\/\/\/scripts\//i,
  ],

  // Note: if you want to override the automatic release value, do not set a
  // `release` value here - use the environment variable `SENTRY_RELEASE`, so
  // that it will also get attached to your source maps
});

// Export router transition start hook for navigation instrumentation
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
