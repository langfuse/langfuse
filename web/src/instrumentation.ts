// See: https://vercel.com/docs/observability/otel-overview

import { cleanUp, setSigtermReceived } from "@/src/utils/shutdown";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // https://github.com/vercel/next.js/issues/51404
    // There is no official best way to gracefully shutdown a Next.js app.

    // if (!process.env.VERCEL) {
    //   await import("./dd-instrumentation");
    // }
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
