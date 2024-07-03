import pino from "pino";

export const getLogger = (
  env: "development" | "production" | "test" = "production"
) => {
  if (env === "production") {
    return pino({
      transport: {
        target: "pino-pretty",
        options: {
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      },
    });
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

export const logger = getLogger();
