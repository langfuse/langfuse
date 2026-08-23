// See: https://vercel.com/docs/observability/otel-overview
export async function register() {
  // This variable is set in the .env file or environment variables
  // Value is true if NEXT_PUBLIC_LANGFUSE_RUN_NEXT_INIT is "true" or undefined
  const isInitLoadingEnabled =
    process.env.NEXT_PUBLIC_LANGFUSE_RUN_NEXT_INIT !== undefined
      ? process.env.NEXT_PUBLIC_LANGFUSE_RUN_NEXT_INIT === "true"
      : true;

  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Not gated on the init-scripts flag above: that skips optional provisioning for
  // local development, whereas a managed credential is a prerequisite for opening
  // any Redis connection. The import stays inside the branch so the static path does
  // not pull in the server barrel, which builds the Redis singleton eagerly.
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
