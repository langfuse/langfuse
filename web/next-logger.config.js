const pino = require("pino");
const pretty = require("pino-pretty");

const logger = (defaultConfig) => {
  const p =
    process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test"
      ? pino(
          {
            ...defaultConfig,
            browser: {
              asObject: true,
            },
          },
          pretty({
            //needs stream config. pretty transport does not work.
            levelFirst: false,
            colorize: true,
            ignore: "",
          }),
        )
      : pino(
          pino.transport({
            ...defaultConfig,
            target: "@logtail/pino", //sends logs to betterstack
            options: {
              sourceToken: process.env.LANGFUSE_WEB_BETTERSTACK_TOKEN,
            },
          }),
        );

  return p;
};

module.exports = {
  logger,
};
