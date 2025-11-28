import * as Sentry from "@sentry/nextjs";

// See: https://vercel.com/docs/observability/otel-overview
export async function register() {
  // This variable is set in the .env file or environment variables
  // Value is true if NEXT_PUBLIC_LANGFUSE_RUN_NEXT_INIT is "true" or undefined
  const isInitLoadingEnabled =
    process.env.NEXT_PUBLIC_LANGFUSE_RUN_NEXT_INIT !== undefined
      ? process.env.NEXT_PUBLIC_LANGFUSE_RUN_NEXT_INIT === "true"
      : true;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Initialize Sentry for server-side
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
      release: process.env.NEXT_PUBLIC_BUILD_ID,

      // Set tracesSampleRate to 1.0 to capture 100%
      // of transactions for performance monitoring.
      tracesSampleRate: process.env.NEXT_PUBLIC_LANGFUSE_TRACING_SAMPLE_RATE
        ? Number(process.env.NEXT_PUBLIC_LANGFUSE_TRACING_SAMPLE_RATE)
        : 0,

      debug: false,

      // Set profilesSampleRate to 1.0 to profile every transaction.
      // Since profilesSampleRate is relative to tracesSampleRate,
      // the final profiling rate can be computed as tracesSampleRate * profilesSampleRate
      profilesSampleRate: 0.5,
    });

    if (isInitLoadingEnabled) {
      console.log("Running init scripts...");
      await import("./observability.config");
      await import("./initialize");
    }
  }
}

// Hook to capture errors from nested React Server Components
// See: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#errors-from-nested-react-server-components
export const onRequestError = Sentry.captureRequestError;
