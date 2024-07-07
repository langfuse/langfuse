export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    // do not run new relic instrumentation in vercel production environments
    if (process.env.NEW_RELIC_API_KEY && process.env.OTLP_ENDPOINT) {
      await import("./new-relic-instrumentation");
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
