// ATTENTION: this is only tested for server side logging!

import { env } from "@/src/env.mjs";
import pino from "pino";

class ConsoleLogLogger {
  info(message: string, ...args: any[]) {
    console.info(message, ...args);
  }

  warn(message: string, ...args: any[]) {
    console.warn(message, ...args);
  }

  debug(message: string, ...args: any[]) {
    console.debug(message, ...args);
  }

  exception(message: string, ...args: any[]) {
    console.error(message, ...args);
  }
}

class PinoLogger {
  private logger;

  constructor() {
    this.logger = pino(
      pino.transport({
        target: "@logtail/pino",
        options: {
          sourceToken: process.env.LANGFUSE_WEB_BETTERSTACK_TOKEN,
        },
      }),
    );
  }

  info(message: string, ...args: any[]) {
    this.logger.info(message, ...args);
  }

  warn(message: string, ...args: any[]) {
    this.logger.warn(message, ...args);
  }

  debug(message: string, ...args: any[]) {
    this.logger.debug(message, ...args);
  }

  exception(message: string, ...args: any[]) {
    this.logger.error(message, ...args);
  }
}

const getLogger = (env: "development" | "production" | "test") => {
  if (env === "development") {
    return new ConsoleLogLogger();
  } else {
    return new PinoLogger();
  }
};

const logger = getLogger(env.NODE_ENV);
export default logger;
