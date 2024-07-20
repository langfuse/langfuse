// See: https://vercel.com/docs/observability/otel-overview

import { shutdown } from "@/src/utils/shutdown";
import prexit from "prexit";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    if (process.env.NEXT_MANUAL_SIG_HANDLE) {
      prexit(async (signal) => {
        console.log("Signal: ", signal);
        return await shutdown(signal);
      });
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
