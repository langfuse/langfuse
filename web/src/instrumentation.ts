// See: https://vercel.com/docs/observability/otel-overview

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./datadog.server.config");
  }
}
