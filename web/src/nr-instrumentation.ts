import { registerOTel } from "@vercel/otel";
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

const { TracerProvider } = (await import("dd-trace")).default.init({
  logInjection: true,
  startupLogs: true,
  runtimeMetrics: true,
});

const provider = new TracerProvider();

registerOTel({
  instrumentations: [new PrismaInstrumentation()],
  // resourceDetectors: [
  //   containerDetector,
  //   envDetector,
  //   hostDetector,
  //   osDetector,
  //   processDetector,
  //   awsEksDetector,
  //   awsEc2Detector,
  // ],
});

provider.register();
