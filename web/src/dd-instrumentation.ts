import { registerOTel } from "@vercel/otel";

const { TracerProvider } = (await import("dd-trace")).default.init({
  runtimeMetrics: true,
  profiling: true,
  startupLogs: true,
  logInjection: true,
});

const provider = new TracerProvider();

registerOTel({
  // instrumentations: [new PrismaInstrumentation()],
});
provider.register();
