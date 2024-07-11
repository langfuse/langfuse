// See: https://vercel.com/docs/observability/otel-overview

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // https://github.com/vercel/next.js/issues/51404
    // There is no official best way to gracefully shutdown a Next.js app.
    if (process.env.NEXT_MANUAL_SIG_HANDLE) {
      process.on("SIGTERM", () => {
        /** graceful shutdown **/
        console.log("SIGTERM received, shutting down");

        process.exit(0);
      });

      process.on("SIGINT", () => {
        console.log("SIGINT received, shutting down");

        process.exit(0);
      });
    }
    // if (!process.env.VERCEL) {
    //   await import("./dd-instrumentation");
    // }
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
