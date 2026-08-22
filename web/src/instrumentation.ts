// See: https://vercel.com/docs/observability/otel-overview
export async function register() {
  // This variable is set in the .env file or environment variables
  // Value is true if NEXT_PUBLIC_LANGFUSE_RUN_NEXT_INIT is "true" or undefined
  const isInitLoadingEnabled =
    process.env.NEXT_PUBLIC_LANGFUSE_RUN_NEXT_INIT !== undefined
      ? process.env.NEXT_PUBLIC_LANGFUSE_RUN_NEXT_INIT === "true"
      : true;

  if (process.env.NEXT_RUNTIME === "nodejs" && isInitLoadingEnabled) {
    console.log("Running init scripts...");
    // Must run before anything opens a Redis connection: ioredis does not retry a
    // rejected AUTH handshake, so a connection opened before the first managed
    // credential arrives is closed for good rather than recovered.
    const { initializeRedisManagedCredentials } =
      await import("@langfuse/shared/src/server");
    await initializeRedisManagedCredentials();
    await import("./observability.config");
    await import("./initialize");
  }
}
