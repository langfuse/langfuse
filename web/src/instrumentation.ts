// See: https://vercel.com/docs/observability/otel-overview

import { cleanUp, setSigtermReceived } from "@/src/utils/shutdown";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // if (!process.env.VERCEL) {
    //   await import("./dd-instrumentation");
    // }
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
