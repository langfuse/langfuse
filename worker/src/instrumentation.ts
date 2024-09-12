import tracer from "dd-trace";
import opentelemetry from "@opentelemetry/api";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { WinstonInstrumentation } from "@opentelemetry/instrumentation-winston";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import { BullMQInstrumentation } from "@appsignal/opentelemetry-instrumentation-bullmq";

const contextManager = new AsyncHooksContextManager().enable();

opentelemetry.context.setGlobalContextManager(contextManager);

const { TracerProvider } = tracer.init({
  runtimeMetrics: true,
});

const provider = new TracerProvider();

registerInstrumentations({
  instrumentations: [
    new IORedisInstrumentation(),
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
    new PrismaInstrumentation(),
    new BullMQInstrumentation(),
    new WinstonInstrumentation({ disableLogSending: true }),
  ],
});

provider.register();
