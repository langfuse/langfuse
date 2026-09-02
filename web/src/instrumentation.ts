// See: https://vercel.com/docs/observability/otel-overview
export async function register() {
  // This variable is set in the .env file or environment variables
  // Value is true if NEXT_PUBLIC_LANGFUSE_RUN_NEXT_INIT is "true" or undefined
  const isInitLoadingEnabled =
    process.env.NEXT_PUBLIC_LANGFUSE_RUN_NEXT_INIT !== undefined
      ? process.env.NEXT_PUBLIC_LANGFUSE_RUN_NEXT_INIT === "true"
      : true;

  const isNodeRuntime = process.env.NEXT_RUNTIME === "nodejs";

  if (isNodeRuntime && isInitLoadingEnabled) {
    console.log("Running init scripts...");
    await import("./observability.config");
  }

  // Capture after dd.init when init runs. Keep the dynamic import so AWS SDK
  // is not loaded before dd-trace wraps it. Install even when init is skipped
  // (secondary replicas set NEXT_PUBLIC_LANGFUSE_RUN_NEXT_INIT=false).
  if (isNodeRuntime) {
    const { installUnhandledRejectionCapture } =
      await import("@langfuse/shared/src/server");
    installUnhandledRejectionCapture();
  }

  if (isNodeRuntime && isInitLoadingEnabled) {
    await import("./initialize");
  }
}
