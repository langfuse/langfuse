import pino from "pino";
import { env } from "./env";

export const getLogger = (
  env: "development" | "production" | "test",
  minLevel = "info"
) => {
  if (env === "production") {
    return pino({
      level: minLevel,
    });
  }
  return pino({
    level: minLevel,
    transport: {
      target: "pino-pretty",
      options: {
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    },
  });
};
const logger = getLogger(env.NODE_ENV, env.LANGFUSE_LOG_LEVEL);
export default logger;
