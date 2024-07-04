import { registerOTel } from "@vercel/otel";
import { PrismaInstrumentation } from "@prisma/instrumentation";

const { TracerProvider } = (await import("dd-trace")).default.init({
  logInjection: true,
  startupLogs: true,
  runtimeMetrics: true,
  profiling: true,
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
