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
      info["dd.trace_id"] = BigInt(`0x${traceIdEnd}`).toString();
      info["dd.span_id"] = BigInt(`0x${spanId}`).toString();
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

/**
 * Render one `text`-format line: `<timestamp> <level> <message>`, then any
 * structured metadata the caller attached, then the stack when present.
 *
 * Callers supply that metadata as a second argument —
 * `logger.error("msg", { projectId, error })` — and winston merges those keys
 * onto `info`, so they belong on the line. `text` is the default
 * `LANGFUSE_LOG_FORMAT`; the `json` format carries the same keys through
 * `winston.format.json()`.
 *
 * Exported so the rendering can be asserted directly, without going through
 * the console transport.
 */
export const formatTextLogLine = (info: winston.Logform.TransformableInfo) => {
  // `splat` is winston's positional-args carrier and is never meant for
  // output; destructuring it here drops it from `meta`.
  const { timestamp, level, message, stack, splat, ...meta } = info;

  const line = `${timestamp} ${level} ${message}`;
  const rendered = Object.keys(meta).length
    ? ` ${safeStringifyMeta(meta)}`
    : "";
  const withMeta = `${line}${rendered}`;
  return stack ? `${withMeta}\n${stack}` : withMeta;
};

/**
 * Metadata is arbitrary caller-supplied data, so it can be circular or hold a
 * BigInt — both of which make `JSON.stringify` throw. A logger that throws
 * while reporting an error destroys the diagnostic it was called to emit, so
 * degrade to a marker instead. `Error` values are unwrapped by hand because
 * they serialise to `{}`.
 */
const safeStringifyMeta = (meta: Record<string, unknown>) => {
  const replacer = (_key: string, value: unknown) => {
    if (value instanceof Error) {
      return { name: value.name, message: value.message, stack: value.stack };
    }
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };

  try {
    return JSON.stringify(meta, replacer);
  } catch {
    return "[unserialisable log metadata]";
  }
};

const getWinstonLogger = (
  nodeEnv: "development" | "production" | "test",
  minLevel = "info",
) => {
  const textLoggerFormat = winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.timestamp(),
    winston.format.align(),
    winston.format.printf(formatTextLogLine),
  );

  const jsonLoggerFormat = winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.timestamp(),
    tracingFormat(),
    severityFormat(),
    winston.format.json(),
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
