// See: https://vercel.com/docs/observability/otel-overview
export async function register() {
  // This variable is set in the .env file or environment variables
  // Value is true if NEXT_PUBLIC_LANGFUSE_RUN_NEXT_INIT is "true" or undefined
  const isInitLoadingEnabled =
    process.env.NEXT_PUBLIC_LANGFUSE_RUN_NEXT_INIT !== undefined
      ? process.env.NEXT_PUBLIC_LANGFUSE_RUN_NEXT_INIT === "true"
      : true;

  const isNodeRuntime = process.env.NEXT_RUNTIME === "nodejs";

  // Not gated on the init-scripts flag above: that skips optional provisioning for
  // local development, whereas a managed credential is a prerequisite for opening
  // any Redis connection. The import stays inside the branch so the static path does
  // not pull in the server barrel, which builds the Redis singleton eagerly.
  if (
    isNodeRuntime &&
    process.env.REDIS_AUTH_METHOD &&
    process.env.REDIS_AUTH_METHOD !== "static"
  ) {
    const { initializeRedisManagedCredentials } =
      await import("@langfuse/shared/src/server");
    await initializeRedisManagedCredentials();
  }

  if (isNodeRuntime && isInitLoadingEnabled) {
    console.log("Running init scripts...");
    await import("./observability.config");
  }

  // Install after dd.init when init runs. Keep the dynamic import so AWS SDK
  // is not loaded before dd-trace wraps it. Install even when init is skipped
  // (secondary replicas set NEXT_PUBLIC_LANGFUSE_RUN_NEXT_INIT=false). On a
  // fatal error, drain in-flight requests before exiting instead of dying
  // abruptly and 5xx-ing them; the drain is imported lazily so its heavy
  // dependencies load only when a fatal actually fires.
  if (isNodeRuntime) {
    const { installProcessErrorHandlers } =
      await import("@langfuse/shared/src/server");
    installProcessErrorHandlers({
      onFatal: async () => {
        const { drainAndClose } = await import("./utils/shutdown");
        await drainAndClose();
      },
    });
    const { startEventLoopMetrics } = await import("./utils/eventLoopMetrics");
    startEventLoopMetrics();
  }

  if (isNodeRuntime && isInitLoadingEnabled) {
    await import("./initialize");
  }

  if (isNodeRuntime) {
    const { env } = await import("./env.mjs");
    if (env.LANGFUSE_OTEL_INGESTION_WORKER_SHADOW_ENABLED === "true") {
      const { preloadOtelIngestionWorkerShadow } =
        await import("./server/otel/otelIngestionWorkerShadow");
      try {
        await preloadOtelIngestionWorkerShadow();
      } catch (error) {
        const { logger } = await import("@langfuse/shared/src/server");
        logger.error(
          "Failed to preload OTel ingestion worker shadow; shadow disabled",
          error,
        );
      }
    }
  }
}
