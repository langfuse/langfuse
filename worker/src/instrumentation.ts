import { env } from "./env";
import * as Sentry from "@sentry/node";

import { SentrySpanProcessor } from "@sentry/opentelemetry-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import {
  Resource,
  envDetector,
  hostDetector,
  osDetector,
  processDetector,
} from "@opentelemetry/resources";
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import {
  SentryPropagator,
  SentrySampler,
  setupEventContextTrace,
  suppressTracing,
} from "@sentry/opentelemetry";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import type { NodeClient } from "@sentry/node";

import {
  awsEc2Detector,
  awsEksDetector,
} from "@opentelemetry/resource-detector-aws";
import {
  ConsoleMetricExporter,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { containerDetector } from "@opentelemetry/resource-detector-container";
import {
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  propagation,
} from "@opentelemetry/api";

import * as opentelemetry from "@opentelemetry/sdk-node";
import logger from "./logger";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

export function initializeOtel(serviceName: string, version?: string) {
  try {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
    const sentryClient = Sentry.getClient<NodeClient>();

    const exporter = new OTLPTraceExporter();
    const sdk = new opentelemetry.NodeSDK({
      // Optional - if omitted, the tracing SDK will be initialized from environment variables

      resource: Resource.default().merge(
        new Resource({
          [SEMRESATTRS_SERVICE_NAME]: serviceName,
          [SEMRESATTRS_SERVICE_VERSION]: version,
        })
      ),
      traceExporter: exporter,
      metricReader: new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
      }),

      // Optional - you can use the metapackage or load each instrumentation individually
      instrumentations: [
        new PrismaInstrumentation(),
        getNodeAutoInstrumentations(),
        new IORedisInstrumentation(),
        new ExpressInstrumentation(),
      ],

      resourceDetectors: [
        containerDetector,
        envDetector,
        hostDetector,
        osDetector,
        processDetector,
        awsEksDetector,
        awsEc2Detector,
      ],
    });

    logger.info("OpenTelemetry setup complete");
    return sdk;
  } catch (e) {
    logger.error("Error setting up OpenTelemetry", e);
    throw e;
  }
}

type CallbackAsyncFn<T> = (span?: Sentry.Span) => Promise<T>;

export async function instrumentAsync<T>(
  ctx: { name: string },
  callback: CallbackAsyncFn<T>
): Promise<T> {
  if (env.SENTRY_DSN) {
    return Sentry.startSpan(ctx, async (span) => {
      return callback(span);
    });
  } else {
    return callback();
  }
}
