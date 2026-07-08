import dd from "dd-trace";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import { WinstonInstrumentation } from "@opentelemetry/instrumentation-winston";
import { AwsInstrumentation } from "@opentelemetry/instrumentation-aws-sdk";
import { BullMQInstrumentation } from "@appsignal/opentelemetry-instrumentation-bullmq";
import { ioredisRequestHook } from "@langfuse/shared/src/server";
import {
  envDetector,
  processDetector,
  resourceFromAttributes,
} from "@opentelemetry/resources";
import { awsEcsDetector } from "@opentelemetry/resource-detector-aws";
import { containerDetector } from "@opentelemetry/resource-detector-container";
import { env } from "./env";

dd.init({
  runtimeMetrics: true,
  plugins: false,
});

const getUndiciRequestUrl = (origin: string, path: string) => {
  try {
    return new URL(path, origin);
  } catch {
    return null;
  }
};

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
    new UndiciInstrumentation({
      requireParentforSpans: true,
      ignoreRequestHook: (request) => {
        const url = getUndiciRequestUrl(request.origin, request.path);
        return url?.hostname === "127.0.0.1" || url?.hostname === "localhost";
      },
      startSpanHook: (request) => {
        const url = getUndiciRequestUrl(request.origin, request.path);

        return url
          ? {
              "url.full": `${url.origin}${url.pathname}`,
              "url.query": "",
            }
          : {};
      },
      requestHook: (span, request) => {
        const url = getUndiciRequestUrl(request.origin, request.path);
        if (url) {
          span.updateName(`${request.method} ${url.pathname}`);
        }
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
  resourceDetectors: [
    envDetector,
    processDetector,
    awsEcsDetector,
    containerDetector,
  ],
});

sdk.start();
