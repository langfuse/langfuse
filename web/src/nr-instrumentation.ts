import { registerOTel } from "@vercel/otel";

const { TracerProvider } = (await import("dd-trace")).default.init({
  logInjection: true,
  startupLogs: true,
  runtimeMetrics: true,
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
