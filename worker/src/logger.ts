import pino from "pino";
import { env } from "./env";

export const getLogger = () => {
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

const logger = getLogger();

export default logger;
