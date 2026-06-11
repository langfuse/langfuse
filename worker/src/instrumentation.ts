import dd from "dd-trace";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import { WinstonInstrumentation } from "@opentelemetry/instrumentation-winston";
import { AwsInstrumentation } from "@opentelemetry/instrumentation-aws-sdk";
import { BullMQInstrumentation } from "@appsignal/opentelemetry-instrumentation-bullmq";
import { ioredisRequestHook } from "@langfuse/shared/src/server";
import { envDetector, resourceFromAttributes } from "@opentelemetry/resources";
import { containerDetector } from "@opentelemetry/resource-detector-container";
import { env } from "./env";

dd.init({
  runtimeMetrics: true,
  plugins: false,
});

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    "service.name": env.OTEL_SERVICE_NAME,
    "service.version": env.BUILD_ID,
  }),
  traceExporter: new OTLPTraceExporter({
    url: `${env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
  }),
  instrumentations: [
    new IORedisInstrumentation({ requestHook: ioredisRequestHook }),
    new HttpInstrumentation({
      requireParentforOutgoingSpans: true,
      ignoreIncomingRequestHook: (req) => {
        // Ignore health checks
        return ["/api/public/health", "/api/public/ready", "/api/health"].some(
          (path) => req.url?.includes(path),
        );
      },
      ignoreOutgoingRequestHook: (req) => {
        return req.host === "127.0.0.1";
      },
      requestHook: (span, req: any) => {
        const url = "path" in req ? req?.path : req?.url;
        let path = new URL(url, `http://${req?.host ?? "localhost"}`).pathname;
        if (path.startsWith("/_next/static")) {
          path = "/_next/static/*";
        }
        span.updateName(`${req?.method} ${path}`);
      },
    }),
    new ExpressInstrumentation(),
    new PrismaInstrumentation({
      ignoreSpanTypes: [
        "prisma:client:serialize",
        "prisma:engine:query",
        "prisma:engine:connection",
        "prisma:engine:serialize",
        "prisma:engine:response_json_serialization",
      ],
    }),
    new AwsInstrumentation(),
    new WinstonInstrumentation({ disableLogSending: true }),
    new BullMQInstrumentation({ useProducerSpanAsConsumerParent: true }),
  ],
  // Datadog's OTLP intake flattens resource attributes onto every ingested
  // span, so each detector attribute costs ingest bytes per span. The AWS ECS
  // and process detectors only duplicated infra tags the Datadog agent adds
  // itself (~1KB/span). containerDetector must stay: the agent resolves those
  // infra tags by looking up the container.id resource attribute.
  resourceDetectors: [envDetector, containerDetector],
});

sdk.start();
