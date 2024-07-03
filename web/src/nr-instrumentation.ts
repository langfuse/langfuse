import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";
import {
  Resource,
  envDetector,
  hostDetector,
  osDetector,
  processDetector,
} from "@opentelemetry/resources";
import {
  awsEc2Detector,
  awsEksDetector,
} from "@opentelemetry/resource-detector-aws";
import { containerDetector } from "@opentelemetry/resource-detector-container";
import { registerOTel } from "@vercel/otel";

const { TracerProvider } = (await import("dd-trace")).default.init({
  logInjection: true,
  startupLogs: true,
});

const provider = new TracerProvider();

registerOTel();
provider.register();
// const sdk = new NodeSDK({
//   resource: new Resource({
//     [SemanticResourceAttributes.SERVICE_NAME]: "web",
//   }),
//   spanProcessors: [
//     new SimpleSpanProcessor(
//       new OTLPTraceExporter({
//         url: process.env.OTLP_ENDPOINT || "https://otlp.nr-data.net",
//         // headers: {
//         //   "api-key": process.env.NEW_RELIC_API_KEY,
//         // },
//       }),
//     ),
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
//   instrumentations: [getNodeAutoInstrumentations()],
// });

// sdk.start();
