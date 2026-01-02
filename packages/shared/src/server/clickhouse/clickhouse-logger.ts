import { ClickHouseLogLevel, Logger } from "@clickhouse/client";
import { logger as winstonLogger } from "../logger";

/**
 * ClickHouseLogger bridges the ClickHouse client Logger interface to our Winston logger
 * This ensures ClickHouse client logs are formatted consistently with our application logs
 * and include OpenTelemetry trace context for correlation with spans in DataDog
 */
export class ClickHouseLogger implements Logger {
  trace({ module, message, args }: LogParams): void {
    winstonLogger.debug(`[${module}] ${message}`, args);
  }

  debug({ module, message, args }: LogParams): void {
    winstonLogger.debug(`[${module}] ${message}`, args);
  }

  info({ module, message, args }: LogParams): void {
    winstonLogger.info(`[${module}] ${message}`, args);
  }

  warn({ module, message, args, err }: WarnLogParams): void {
    winstonLogger.warn(`[${module}] ${message}`, {
      ...args,
      ...(err ? { error: err.message, stack: err.stack } : {}),
    });
  }

  error({ module, message, args, err }: ErrorLogParams): void {
    winstonLogger.error(`[${module}] ${message}`, {
      ...args,
      error: err.message,
      stack: err.stack,
    });
  }
}

// Types from @clickhouse/client documentation
interface LogParams {
  module: string;
  message: string;
  args?: Record<string, unknown>;
}

type ErrorLogParams = LogParams & { err: Error };
type WarnLogParams = LogParams & { err?: Error };

/**
 * Map Winston log level to ClickHouse log level
 */
export const mapLogLevel = (level: string): ClickHouseLogLevel => {
  switch (level.toLowerCase()) {
    case "error":
      return ClickHouseLogLevel.ERROR;
    case "warn":
      return ClickHouseLogLevel.WARN;
    case "info":
      return ClickHouseLogLevel.INFO;
    case "debug":
      return ClickHouseLogLevel.DEBUG;
    case "trace":
      return ClickHouseLogLevel.TRACE;
    default:
      return ClickHouseLogLevel.OFF;
  }
};
