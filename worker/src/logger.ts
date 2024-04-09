import pino from "pino";
import { env } from "./env";

export const getLogger = (env: "development" | "production" | "test") => {
  if (env === "production") {
    return pino();
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
