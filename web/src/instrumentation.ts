// See: https://vercel.com/docs/observability/otel-overview

export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== "DEV"
  ) {
    await import("./datadog.server.config");
    await import("./initialize");
  }
}
