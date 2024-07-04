import { env } from "./env";

import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import logger from "./logger";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import {
  awsEksDetector,
  awsEc2Detector,
} from "@opentelemetry/resource-detector-aws";
import {
  hostDetector,
  osDetector,
  processDetector,
} from "@opentelemetry/resources/build/src/detectors/platform";
import { envDetector } from "@opentelemetry/resources";
import { containerDetector } from "@opentelemetry/resource-detector-container";
import { SEMRESATTRS_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { Resource } from "@opentelemetry/resources";

export function initializeOtel(serviceName: string, version?: string) {
  try {
    const sdk = new NodeSDK({
      // Optional - if omitted, the tracing SDK will be initialized from environment variables
      resource: new Resource({
        [SEMRESATTRS_SERVICE_NAME]: "worker",
      }),
      spanProcessors: [
        new SimpleSpanProcessor(
          new OTLPTraceExporter({
            url: process.env.OTLP_ENDPOINT || "https://otlp.eu01.nr-data.net",
            headers: {
              "api-key": process.env.NEW_RELIC_API_KEY,
            },
          })
        ),
      ],
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

type CallbackAsyncFn<T> = () => Promise<T>; //span?: Sentry.Span

export async function instrumentAsync<T>(
  ctx: { name: string },
  callback: CallbackAsyncFn<T>
): Promise<T> {
  if (env.SENTRY_DSN) {
    // return Sentry.startSpan(ctx, async (span) => {
    //   return callback(span);
    // });
    return callback();
  } else {
    return callback();
  }
}
