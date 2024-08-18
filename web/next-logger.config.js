const pino = require("pino");
const pretty = require("pino-pretty");

const logger = (defaultConfig) => {
  if (process.env.NODE_ENV !== "development") {
    console.log("Using betterstack logger");
    return pino(
      pino.transport({
        ...defaultConfig,
        target: "@logtail/pino", //sends logs to betterstack
        options: {
          sourceToken: process.env.LANGFUSE_WEB_BETTERSTACK_TOKEN,
        },
      }),
    );
  } else {
    console.log("Using pino pretty logger");
    return pino(
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
  }
};

module.exports = {
  logger,
};
