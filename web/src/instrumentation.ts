import { PrismaInstrumentation } from "@prisma/instrumentation";
import { registerOTel } from "@vercel/otel";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // await import("./nr-instrumentation");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    // await import("./sentry.edge.config");
  }
}
