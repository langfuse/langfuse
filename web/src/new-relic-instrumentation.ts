import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { SEMRESATTRS_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { PrismaInstrumentation } from "@prisma/instrumentation";
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

const sdk = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: "web",
  }),
  spanProcessors: [
    new BatchSpanProcessor(
      new OTLPTraceExporter({
        url:
          process.env.OTLP_ENDPOINT ||
          "https://otlp.eu01.nr-data.net/v1/traces",
        headers: {
          "api-key": process.env.NEW_RELIC_API_KEY,
        },
      }),
    ),
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
  instrumentations: [
    getNodeAutoInstrumentations(),
    new PrismaInstrumentation(),
  ],
});

sdk.start();
