export const getLogger = (env: "development" | "production" | "test") => {
  return envToLogger[env] ?? true;
};

const envToLogger = {
  development: {
    transport: {
      target: "pino-pretty",
      options: {
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    },
  },
  production: true,
  test: false,
};
