import dd from "dd-trace";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import { WinstonInstrumentation } from "@opentelemetry/instrumentation-winston";
// import { BullMQInstrumentation } from "@appsignal/opentelemetry-instrumentation-bullmq";
import {
  envDetector,
  processDetector,
  Resource,
} from "@opentelemetry/resources";
import { awsEcsDetector } from "@opentelemetry/resource-detector-aws";
import { env } from "@/src/env.mjs";

if (!process.env.VERCEL && process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
  dd.init({
    runtimeMetrics: true,
    plugins: false,
  });

  const sdk = new NodeSDK({
    resource: new Resource({
      "service.name": env.OTEL_SERVICE_NAME,
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
    }),
    instrumentations: [
      new IORedisInstrumentation(),
      new HttpInstrumentation({
        requireParentforOutgoingSpans: true,
        requestHook: (span, request: any) => {
          const { method, url } = request;
          let path = new URL(url, `http://${request.host}`).pathname;
          if (path.startsWith("/_next/static")) {
            path = "/_next/static/*";
          }
          span.updateName(`${method} ${path}`);
        },
      }),
      new PrismaInstrumentation(),
      new WinstonInstrumentation({ disableLogSending: true }),
      // new BullMQInstrumentation(),
    ],
    resourceDetectors: [envDetector, processDetector, awsEcsDetector],
  });

  sdk.start();
}
