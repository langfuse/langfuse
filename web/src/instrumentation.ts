// See: https://vercel.com/docs/observability/otel-overview

import { setSigtermReceived } from "@/src/utils/shutdown";
import prexit from "prexit";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    if (process.env.NEXT_MANUAL_SIG_HANDLE) {
      // process.on("SIGTERM", async () => {
      //   await shutdown();
      // });

      // process.on("SIGINT", async () => {
      //   await shutdown();
      // });
      prexit(async (signal) => {
        console.log("Signal: ", signal);
        return await shutdown();
      });
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const shutdown = async () => {
  console.log("SIGTERM / SIGINT received. Shutting down");
  setSigtermReceived();

  // wait for 15 seconds
  return await new Promise<void>((resolve) => {
    setTimeout(() => {
      console.log("Shutdown complete");
      resolve();
    }, 15000);
  });
};
