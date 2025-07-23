// Console override for comprehensive logging
let logger: any;

if (
  typeof process !== "undefined" &&
  process.env.NEXT_RUNTIME === "nodejs" &&
  process.env.NODE_ENV === "development"
) {
  try {
    // Import logger and set up console overrides
    const loggerModule = require("@langfuse/shared/src/server/logger");
    logger = loggerModule.logger;

    // Override console methods to route through Winston
    console.log = (...args: any[]) => {
      const message = args
        .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
        .join(" ");
      logger?.info(message);
    };

    console.info = (...args: any[]) => {
      const message = args
        .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
        .join(" ");
      logger?.info(message);
    };

    console.warn = (...args: any[]) => {
      const message = args
        .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
        .join(" ");
      logger?.warn(message);
    };

    console.error = (...args: any[]) => {
      const message = args
        .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
        .join(" ");
      logger?.error(message);
    };
  } catch (error) {
    // Ignore errors during logger initialization to prevent blocking Next.js startup
  }
}

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
    await import("./observability.config");
    await import("./initialize");
  }
}
