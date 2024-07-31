import { env } from "@/src/env.mjs";

if (!process.env.VERCEL && env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
  const { TracerProvider } = (await import("dd-trace")).default.init({
    runtimeMetrics: true,
    profiling: false,
  });

  const provider = new TracerProvider();

  provider.register();
}
