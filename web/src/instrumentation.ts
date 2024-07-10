export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (!process.env.VERCEL) {
      await import("./dd-instrumentation");
    } else {
      await import("./sentry.server.config");
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
