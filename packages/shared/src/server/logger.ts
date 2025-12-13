import { getEnv } from "../env";
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

const getWinstonLogger = (
  nodeEnv: "development" | "production" | "test",
  minLevel = "info",
) => {
  const env = getEnv(); // Use lazy env loading
  const textLoggerFormat = winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.timestamp(),
    winston.format.align(),
    winston.format.printf((info) => {
      const logMessage = `${info.timestamp} ${info.level} ${info.message}`;
      return info.stack ? `${logMessage}\n${info.stack}` : logMessage;
    }),
  );

  const jsonLoggerFormat = winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.timestamp(),
    tracingFormat(),
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

let _logger: winston.Logger | null = null;

export function getLogger(): winston.Logger {
  if (_logger === null) {
    const env = getEnv();
    _logger = getWinstonLogger(env.NODE_ENV, env.LANGFUSE_LOG_LEVEL);
  }
  return _logger;
}

// For backward compatibility, create a getter proxy
export const logger = new Proxy({} as winston.Logger, {
  get(target, prop) {
    const actualLogger = getLogger();
    const value = actualLogger[prop as keyof winston.Logger];
    return typeof value === "function" ? value.bind(actualLogger) : value;
  },
});
