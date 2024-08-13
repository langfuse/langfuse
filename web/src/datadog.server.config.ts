import { env } from "@/src/env.mjs";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import {
  SimpleSpanProcessor,
  ConsoleSpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import opentelemetry from "@opentelemetry/api";

if (!process.env.VERCEL && env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
  const contextManager = new AsyncHooksContextManager().enable();

  opentelemetry.context.setGlobalContextManager(contextManager);

  const provider = new NodeTracerProvider();

  provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));

  registerInstrumentations({
    instrumentations: [
      new IORedisInstrumentation(),
      new HttpInstrumentation(),
      new PrismaInstrumentation(),
      getNodeAutoInstrumentations(),
    ],
  });

  provider.register();
}
