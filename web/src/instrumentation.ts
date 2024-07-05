export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./new-relic-instrumentation");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
