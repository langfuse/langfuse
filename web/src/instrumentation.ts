// Development logging setup: Two-layer approach for comprehensive log capture
// 1. Console overrides: catch application-level logs (console.log calls)
// 2. stdout/stderr interception: catch Next.js internal logs bypassing console (HTTP requests)
// All setup moved to register() to avoid importing Winston during build

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

  // Set up development logging (only in Node.js development runtime)
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NODE_ENV === "development"
  ) {
    try {
      // Dynamically import logger only when actually needed in Node.js runtime
      const loggerModule = require("@langfuse/shared/src/server/logger");
      const logger = loggerModule.logger;

      if (!logger) return;

      // 1. Console overrides to catch application-level logs
      const formatMessage = (...args: any[]) =>
        args
          .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
          .join(" ");

      console.log = (...args: any[]) => logger.info(formatMessage(...args));
      console.info = (...args: any[]) => logger.info(formatMessage(...args));
      console.warn = (...args: any[]) => logger.warn(formatMessage(...args));
      console.error = (...args: any[]) => logger.error(formatMessage(...args));

      // 2. stdout/stderr interception to catch Next.js HTTP logs (skip Winston's own output)
      // Only match raw Next.js logs that start with whitespace + HTTP method (not Winston's timestamped logs)
      const rawHttpRequestRegex = /^\s+(GET|POST|PUT|DELETE|PATCH)\s+\/api\//;
      const winstonTimestampRegex =
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/;

      const interceptStream = (
        stream: NodeJS.WriteStream,
        originalWrite: typeof stream.write,
      ) => {
        stream.write = function (chunk: any, ...args: any[]) {
          const message = chunk.toString();

          // Only capture raw Next.js HTTP logs (start with whitespace, no timestamp)
          if (
            rawHttpRequestRegex.test(message) &&
            !winstonTimestampRegex.test(message)
          ) {
            logger.info(message.trim());
          }
          return originalWrite.call(this, chunk, ...args);
        };
      };

      interceptStream(process.stdout, process.stdout.write);
      interceptStream(process.stderr, process.stderr.write);
    } catch (error) {
      // Ignore logging setup errors to prevent blocking Next.js startup
    }
  }
}
