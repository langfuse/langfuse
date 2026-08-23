// See: https://vercel.com/docs/observability/otel-overview
export async function register() {
  // This variable is set in the .env file or environment variables
  // Value is true if NEXT_PUBLIC_LANGFUSE_RUN_NEXT_INIT is "true" or undefined
  const isInitLoadingEnabled =
    process.env.NEXT_PUBLIC_LANGFUSE_RUN_NEXT_INIT !== undefined
      ? process.env.NEXT_PUBLIC_LANGFUSE_RUN_NEXT_INIT === "true"
      : true;

  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Deliberately not gated on the init-scripts flag above: that switch exists to
  // skip optional provisioning during local development, whereas a managed
  // credential is a prerequisite for opening any Redis connection at all. Without
  // it the first command races its lazy connection against the token fetch and
  // authenticates with an empty password, leaving rate limiting, caching and queue
  // production failing until a retry succeeds.
  //
  // The import is kept inside the branch so the default static-password path does
  // not pull in the shared server barrel, which builds the Redis singleton eagerly.
  if (
    process.env.REDIS_AUTH_METHOD &&
    process.env.REDIS_AUTH_METHOD !== "static"
  ) {
    const { initializeRedisManagedCredentials } =
      await import("@langfuse/shared/src/server");
    await initializeRedisManagedCredentials();
  }

  if (isInitLoadingEnabled) {
    console.log("Running init scripts...");
    await import("./observability.config");
    await import("./initialize");
  }
}
