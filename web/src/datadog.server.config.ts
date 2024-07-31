import { env } from "@/src/env.mjs";

if (!process.env.VERCEL && env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
  const tracer = (await import("dd-trace")).default.init({
    runtimeMetrics: true,
    profiling: false,
    logInjection: true,
  });

  tracer.use("next");
}
