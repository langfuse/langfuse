let logger: any;
// Development logging setup:
// 1. Console overrides: catch application-level logs (console.log calls)
// 2. stdout/stderr interception: catch Next.js internal logs bypassing console (HTTP requests)
const isDevelopmentNode =
  typeof process !== "undefined" &&
  process.env.NEXT_RUNTIME === "nodejs" &&
  process.env.NODE_ENV === "development";

if (isDevelopmentNode) {
  // 1. console overrides
  try {
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

  // 2. capture stdout/stderr writes to get Next.js HTTP logs (only way with Pages Router?)
  if (isDevelopmentNode && logger) {
    try {
      const httpRequestRegex = /^\s*(GET|POST|PUT|DELETE|PATCH)\s+\/api\//;

      const originalStdoutWrite = process.stdout.write;
      const originalStderrWrite = process.stderr.write;

      process.stdout.write = function (chunk: any, ...args: any[]) {
        const message = chunk.toString();

        if (httpRequestRegex.test(message)) {
          logger.info(message.trim());
        }

        return originalStdoutWrite.call(this, chunk, ...args);
      };

      process.stderr.write = function (chunk: any, ...args: any[]) {
        const message = chunk.toString();

        if (httpRequestRegex.test(message)) {
          logger.info(message.trim());
        }

        return originalStderrWrite.call(this, chunk, ...args);
      };
    } catch (error) {
      // Ignore stdout/stderr interception errors
    }
  }
}
