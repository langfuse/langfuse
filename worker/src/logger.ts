import pino from "pino";
import { env } from "./env";

const getBetterstackLogginTransport = (minLevel: string) => {
  return env.LANGFUSE_WORKER_BETTERSTACK_TOKEN
    ? pino.transport({
        target: "@logtail/pino",
        options: { sourceToken: env.LANGFUSE_WORKER_BETTERSTACK_TOKEN },
        level: minLevel,
      })
    : { level: minLevel };
};

export const getLogger = (
  env: "development" | "production" | "test",
  minLevel = "info"
) => {
  if (env === "production") {
    return pino(getBetterstackLogginTransport(minLevel));
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
