import pino from "pino";
import { env } from "./env";

// Map Pino levels to Google Cloud Logging severity levels
// https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#LogSeverity
const levelToSeverity = {
  trace: "DEBUG",
  debug: "DEBUG",
  info: "INFO",
  warn: "WARNING",
  error: "ERROR",
  fatal: "CRITICAL",
};

export const getLogger = (env: "development" | "production" | "test") => {
  if (env === "production") {
    return pino({
      base: { serviceContext: { service: "langfuse-worker" } },
      formatters: {
        level(label) {
          const pinoLevel = label as pino.Level;
          // `@type` property tells Error Reporting to track even if there is no `stack_trace`
          const typeProp =
            label === "error" || label === "fatal"
              ? {
                  "@type":
                    "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent",
                }
              : {};
          return {
            level: pinoLevel,
            severity: levelToSeverity[pinoLevel],
            ...typeProp,
          };
        },
        log(object: object & { err?: Error }) {
          const stackTrace = object.err?.stack;
          const stackProp = stackTrace ? { stack_trace: stackTrace } : {};
          return {
            ...object,
            ...stackProp,
          };
        },
      },
      messageKey: "message",
      timestamp: () => `,"eventTime":${Date.now() / 1000.0}`,
    });
  }
  return pino({
    transport: {
      target: "pino-pretty",
      options: {
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    },
  });
};

const logger = getLogger(env.NODE_ENV);

export default logger;
