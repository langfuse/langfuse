import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import dd from "dd-trace";
import opentelemetry from "@opentelemetry/api";
// import { BullMQInstrumentation } from "@appsignal/opentelemetry-instrumentation-bullmq";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";

if (!process.env.VERCEL && process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
  console.log("Initializing otel tracing");
  const contextManager = new AsyncHooksContextManager().enable();

  opentelemetry.context.setGlobalContextManager(contextManager);

  const tracer = dd.init({
    profiling: false,
    runtimeMetrics: true,
  });

  const { TracerProvider } = tracer;

  const provider = new TracerProvider();

  registerInstrumentations({
    instrumentations: [
      new IORedisInstrumentation(),
      new HttpInstrumentation(),
      new PrismaInstrumentation(),
      getNodeAutoInstrumentations(),
      new UndiciInstrumentation(),
      // new BullMQInstrumentation(),
    ],
  });

  provider.register();
}
