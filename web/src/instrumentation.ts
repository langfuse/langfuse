// See: https://vercel.com/docs/observability/otel-overview

export async function register() {
  console.log(`NEXT_RUNTIME ${process.env.NEXT_RUNTIME}`);
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./datadog.server.config");
  }
}
