import { Prisma } from "@langfuse/shared";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import { registerOTel } from "@vercel/otel";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { TracerProvider } = (await import("dd-trace")).default.init({
      logInjection: true,
      startupLogs: true,
    });

    const provider = new TracerProvider();

    registerOTel({
      instrumentations: [new PrismaInstrumentation()],
    });
    provider.register();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    // await import("./sentry.edge.config");
  }
}
