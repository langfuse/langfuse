import { env } from "@/src/env.mjs";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import dd from "dd-trace";

if (!process.env.VERCEL && env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
  // const contextManager = new AsyncHooksContextManager().enable();

  // context.setGlobalContextManager(contextManager);

  const tracer = dd.init({
    profiling: false,
    runtimeMetrics: true,
  });

  const { TracerProvider } = tracer.init({});

  const provider = new TracerProvider();

  registerInstrumentations({
    tracerProvider: provider,
    instrumentations: [
      new IORedisInstrumentation(),
      new HttpInstrumentation(),
      new PrismaInstrumentation({ middleware: true }),
      // getNodeAutoInstrumentations(),
    ],
  });

  provider.register();
}
