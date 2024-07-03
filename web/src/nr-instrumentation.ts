import { registerOTel } from "@vercel/otel";
import { PrismaInstrumentation } from "@prisma/instrumentation";

const { TracerProvider } = (await import("dd-trace")).default.init({
  logInjection: true,
  startupLogs: true,
  runtimeMetrics: true,
});

const provider = new TracerProvider();

registerOTel({
  instrumentations: [new PrismaInstrumentation()],
});

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
