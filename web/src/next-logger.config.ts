// next-logger.config.js
const pino = require("pino");

const logger = (defaultConfig) =>
  pino({
    ...defaultConfig,
    transport: {
      target: "pino-pretty",
      options: {
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    },
  });

module.exports = {
  logger,
};
