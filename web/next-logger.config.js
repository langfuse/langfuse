const pino = require("pino");
const pretty = require("pino-pretty");

const logger = (defaultConfig) => {
  return process.env.NODE_ENV !== "development"
    ? pino(
        pino.transport({
          ...defaultConfig,
          target: "@logtail/pino", //sends logs to betterstack
          options: {
            sourceToken: process.env.LANGFUSE_WEB_BETTERSTACK_TOKEN,
          },
        }),
      )
    : pino(
        {
          ...defaultConfig,
          browser: {
            asObject: true,
          },
        },
        pretty({
          levelFirst: false,
          colorize: true,
          ignore: "",
        }),
      );
};

module.exports = {
  logger,
};
