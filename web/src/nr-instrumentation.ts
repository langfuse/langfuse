import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { PrismaInstrumentation } from "@prisma/instrumentation";

import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";

// Enable debug mode for OpenTelemetry
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: "web",
  }),
  spanProcessors: [
    new SimpleSpanProcessor(
      new OTLPTraceExporter({
        url: process.env.OTLP_ENDPOINT || "https://otlp.eu01.nr-data.net",
        headers: {
          "api-key": process.env.NEW_RELIC_API_KEY,
        },
      }),
    ),
  ],
  // resourceDetectors: [
  //   containerDetector,
  //   envDetector,
  //   hostDetector,
  //   osDetector,
  //   processDetector,
  //   awsEksDetector,
  //   awsEc2Detector,
  // ],
  instrumentations: [
    getNodeAutoInstrumentations(),
    new PrismaInstrumentation(),
  ],
});

sdk.start();
