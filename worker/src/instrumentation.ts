import { env } from "./env";

import * as Sentry from "@sentry/node";

import logger from "./logger";

export function initializeOtel(serviceName: string, version?: string) {
  try {
    const tracer = require("dd-trace").init();
    const { TracerProvider } = tracer;

    const provider = new TracerProvider();
    provider.register();

    // opentelemetry.api.trace.setGlobalTracerProvider(provider);

    // const sdk = new opentelemetry.NodeSDK({
    //   // Optional - if omitted, the tracing SDK will be initialized from environment variables

    //   // Optional - you can use the metapackage or load each instrumentation individually
    //   instrumentations: [
    //     new PrismaInstrumentation(),
    //     getNodeAutoInstrumentations(),
    //     new IORedisInstrumentation(),
    //     new ExpressInstrumentation(),
    //   ],

    //   resourceDetectors: [
    //     containerDetector,
    //     envDetector,
    //     hostDetector,
    //     osDetector,
    //     processDetector,
    //     awsEksDetector,
    //     awsEc2Detector,
    //   ],
    // });

    logger.info("OpenTelemetry setup complete");
    // return sdk;
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
