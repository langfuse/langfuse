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

// ioredis attaches the command it was running to reply errors, and for AUTH and
// HELLO the arguments are the credential itself. winston's `errors` format lifts
// an Error's own enumerable properties into the record, so any handler passing a
// raw connection error -- and there are dozens across the queue layer, e.g.
// `queue.on("error", (err) => logger.error("...", err))` -- would otherwise
// serialise it. This mirrors the redaction already applied to ioredis spans in
// `server/instrumentation`.
const CREDENTIAL_BEARING_COMMANDS = new Set(["auth", "hello"]);

export const redactCommandCredentials = winston.format((info) => {
  const command = info.command as
    | { name?: unknown; args?: unknown }
    | undefined;

  if (
    command &&
    typeof command === "object" &&
    typeof command.name === "string" &&
    CREDENTIAL_BEARING_COMMANDS.has(command.name.toLowerCase())
  ) {
    info.command = { name: command.name, args: "[REDACTED]" };
  }

  return info;
});

const getWinstonLogger = (
  nodeEnv: "development" | "production" | "test",
  minLevel = "info",
) => {
  const textLoggerFormat = winston.format.combine(
    winston.format.errors({ stack: true }),
    redactCommandCredentials(),
    winston.format.timestamp(),
    winston.format.align(),
    winston.format.printf((info) => {
      const logMessage = `${info.timestamp} ${info.level} ${info.message}`;
      return info.stack ? `${logMessage}\n${info.stack}` : logMessage;
    }),
  );

  const jsonLoggerFormat = winston.format.combine(
    winston.format.errors({ stack: true }),
    redactCommandCredentials(),
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

export const logger = getWinstonLogger(env.NODE_ENV, env.LANGFUSE_LOG_LEVEL);
