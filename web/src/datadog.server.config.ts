import { env } from "@/src/env.mjs";

if (!process.env.VERCEL && env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
  const { registerOTel } = await import("@vercel/otel");
  const { TracerProvider } = (await import("dd-trace")).default.init({
    runtimeMetrics: true,
    profiling: false,
    logInjection: true,
  });
  const provider = new TracerProvider();
  registerOTel({
    // instrumentations: [new PrismaInstrumentation()],
  });
  provider.register();
}
