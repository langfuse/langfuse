import dd from "dd-trace";
import opentelemetry from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { WinstonInstrumentation } from "@opentelemetry/instrumentation-winston";
import { Resource } from "@opentelemetry/resources";
import { env } from "@/src/env.mjs";
// import { BullMQInstrumentation } from "@appsignal/opentelemetry-instrumentation-bullmq";

if (!process.env.VERCEL && process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
  dd.init({
    runtimeMetrics: true,
    plugins: false,
  });

  const contextManager = new AsyncHooksContextManager().enable();

  opentelemetry.context.setGlobalContextManager(contextManager);

  const sdk = new NodeSDK({
    resource: new Resource({
      "service.name": env.OTEL_SERVICE_NAME,
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
    }),
    instrumentations: [
      new IORedisInstrumentation(),
      new HttpInstrumentation(),
      new PrismaInstrumentation(),
      new WinstonInstrumentation({ disableLogSending: true }),
      getNodeAutoInstrumentations(),
      new UndiciInstrumentation(),
      // new BullMQInstrumentation(),
    ],
  });

  sdk.start();
}
