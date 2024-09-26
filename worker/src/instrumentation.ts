import tracer from "dd-trace";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import opentelemetry from "@opentelemetry/api";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { WinstonInstrumentation } from "@opentelemetry/instrumentation-winston";
import { AwsInstrumentation } from "@opentelemetry/instrumentation-aws-sdk";
// import { BullMQInstrumentation } from "@appsignal/opentelemetry-instrumentation-bullmq";

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
    new AwsInstrumentation(),
    new WinstonInstrumentation({ disableLogSending: true }),
    getNodeAutoInstrumentations(),
    new UndiciInstrumentation(),
    // new BullMQInstrumentation(),
  ],
});

provider.register();
