import { env } from "../env";
import winston from "winston";

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
  return winston.createLogger({
    level: minLevel,
    format: format,
    transports: [new winston.transports.Console()],
  });
};

export const logger = getWinstonLogger(env.NODE_ENV, env.LANGFUSE_LOG_LEVEL);
