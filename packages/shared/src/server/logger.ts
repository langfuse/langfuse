import { env } from "../env";
import winston from "winston";
import { getCurrentSpan } from "./instrumentation";
import { propagation, context } from "@opentelemetry/api";

const tracingFormat = function () {
  return winston.format((info) => {
    const span = getCurrentSpan();
    if (span) {
      const { spanId, traceId } = span.spanContext();
      const traceIdEnd = traceId.slice(traceId.length / 2);
      info.dd = {
        trace_id: BigInt(`0x${traceIdEnd}`).toString(),
        span_id: BigInt(`0x${spanId}`).toString(),
      };
      info["trace_id"] = traceId;
      info["span_id"] = spanId;
    }
    const baggage = propagation.getBaggage(context.active());
    if (baggage) {
      const headerObj: Record<string, string> = {};
      baggage.getAllEntries().forEach(([k, v]) => (headerObj[k] = v.value));
      if (Object.keys(headerObj).length) info = { ...headerObj, ...info };
    }
    return info;
  })();
};

/**
 * Log collectors disagree on which field carries the level. GCP Cloud Logging
 * only reads `severity`, and only its own LogSeverity names, so a JSON line
 * that carries the level in `level` is indexed as DEFAULT there. Datadog and
 * Loki read `level` as well, so emitting both fields makes one line sort
 * correctly everywhere.
 */
const gcpSeverityByLevel: Record<string, string> = {
  error: "ERROR",
  warn: "WARNING",
  info: "INFO",
  http: "INFO",
  verbose: "DEBUG",
  debug: "DEBUG",
  silly: "DEBUG",
};

const severityFormat = function () {
  return winston.format((info) => {
    info.severity = gcpSeverityByLevel[info.level] ?? "DEFAULT";
    return info;
  })();
};

// `Error` serialises to `{}`, so Errors anywhere in the metadata are expanded,
// and BigInt is stringified. Build one per log line: the cycle guard breaks
// cyclic `cause` chains — the replacer hands back a new object for every
// Error, so the stringifier's identity-based circular check never fires — and
// renders an Error seen twice in the same line as "[Circular]".
const createErrorReplacer = () => {
  const visitedErrors = new WeakSet<Error>();

  return (_key: string, value: unknown) => {
    if (value instanceof Error) {
      if (visitedErrors.has(value)) return "[Circular]";
      visitedErrors.add(value);
      return {
        ...value, // keeps fields an SDK attached to its own error type
        name: value.name,
        message: value.message,
        stack: value.stack,
        // `cause` and `errors` are non-enumerable, so the spread misses them
        ...(value.cause === undefined ? {} : { cause: value.cause }),
        ...(value instanceof AggregateError ? { errors: value.errors } : {}),
      };
    }
    return typeof value === "bigint" ? value.toString() : value;
  };
};

// Metadata is arbitrary caller-supplied data, and circular values make
// `JSON.stringify` throw. A logger that throws destroys the diagnostic it was
// called to emit, so degrade to a marker.
const stringifyMeta = (meta: Record<string, unknown>) => {
  try {
    return JSON.stringify(meta, createErrorReplacer());
  } catch {
    return "[unserialisable log metadata]";
  }
};

const jsonFormat = winston.format.json();

const getWinstonLogger = (
  nodeEnv: "development" | "production" | "test",
  minLevel = "info",
) => {
  const textLoggerFormat = winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.timestamp(),
    winston.format.align(),
    winston.format.printf((info) => {
      // `splat` is winston's positional-args carrier, not output.
      const { timestamp, level, message, stack, splat, ...meta } = info;
      const rendered = Object.keys(meta).length
        ? ` ${stringifyMeta(meta)}`
        : "";
      const logMessage = `${timestamp} ${level} ${message}${rendered}`;
      return stack ? `${logMessage}\n${stack}` : logMessage;
    }),
  );

  const jsonLoggerFormat = winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.timestamp(),
    tracingFormat(),
    severityFormat(),
    winston.format((info) =>
      jsonFormat.transform(info, { replacer: createErrorReplacer() }),
    )(),
  );

  const format =
    env.LANGFUSE_LOG_FORMAT === "text" ? textLoggerFormat : jsonLoggerFormat;
  return winston.createLogger({
    level: minLevel,
    format: format,
    transports: [new winston.transports.Console()],
  });
};

export const logger = getWinstonLogger(env.NODE_ENV, env.LANGFUSE_LOG_LEVEL);
