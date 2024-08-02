import { env } from "@/src/env.mjs";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { Resource } from "@opentelemetry/resources";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";
import { SemanticResourceAttributes as SEMRESATTRS_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import { context } from "@opentelemetry/api";
import { Trace } from "@/src/components/trace";

if (!process.env.VERCEL && env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
  const contextManager = new AsyncHooksContextManager().enable();

  context.setGlobalContextManager(contextManager);
  const { TracerProvider } = (await import("dd-trace")).default.init({
    runtimeMetrics: true,
    profiling: false,
  });

  const provider = new TracerProvider();

  // provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));

  provider.register();

  registerInstrumentations({
    tracerProvider: provider,
    instrumentations: [
      new HttpInstrumentation(),
      new PrismaInstrumentation(),
      new IORedisInstrumentation(),
    ],
  });
}
