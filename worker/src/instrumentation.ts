import tracer from "dd-trace";
import ot, { SpanKind } from "@opentelemetry/api";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

const { TracerProvider } = tracer.init({
  profiling: false,
  runtimeMetrics: true,
});

const provider = new TracerProvider();

registerInstrumentations({
  instrumentations: [
    new IORedisInstrumentation(),
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
    new PrismaInstrumentation(),
    getNodeAutoInstrumentations(),
  ],
});

provider.register();
