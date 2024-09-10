import { env } from "../env";
import winston from "winston";
import Transport from "winston-transport";
import { getCurrentSpan } from "./instrumentation";

class TracedTransport extends Transport {
  constructor(opts: Transport.TransportStreamOptions = {}) {
    super(opts);
  }

  log(info: Record<string, any>, callback: () => void): void {
    setImmediate(() => {
      this.emit("logged", info);
    });

    const currentSpan = getCurrentSpan();
    info.trace_id = currentSpan?.spanContext().traceId;
    info.span_id = currentSpan?.spanContext().spanId;
    console.log(JSON.stringify(info));

    callback();
  }
}

const getWinstonLogger = (
  nodeEnv: "development" | "production" | "test",
  minLevel = "info",
) => {
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
    winston.format.json(),
  );

  const format =
    env.LANGFUSE_LOG_FORMAT === "text" ? textLoggerFormat : jsonLoggerFormat;
  const transport =
    env.LANGFUSE_LOG_FORMAT === "text"
      ? new winston.transports.Console()
      : new TracedTransport();
  return winston.createLogger({
    level: minLevel,
    format: format,
    transports: [transport],
  });
};

export const logger = getWinstonLogger(env.NODE_ENV, env.LANGFUSE_LOG_LEVEL);
