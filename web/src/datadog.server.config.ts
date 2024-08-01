import { env } from "@/src/env.mjs";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";

if (!process.env.VERCEL && env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
  const { TracerProvider } = (await import("dd-trace")).default.init({
    runtimeMetrics: true,
    profiling: false,
  });

  const provider = new TracerProvider();

  provider.register();

  registerInstrumentations({
    instrumentations: [new IORedisInstrumentation(), new HttpInstrumentation()],
  });
}
