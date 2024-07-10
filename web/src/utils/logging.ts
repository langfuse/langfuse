const pino = require("pino");
import { type Logger } from "pino";

export const logger: Logger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
    },
  },
  level: "info",

  redact: [], // prevent logging of sensitive data
});
