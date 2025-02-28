import "./instrumentation"; // instrumenting the application
import app from "./app";
import { env } from "./env";
import { logger } from "@langfuse/shared/src/server";

export const server = app.listen(env.PORT, env.HOSTNAME, () => {
  logger.info(`Listening: http://${env.HOSTNAME}:${env.PORT}`);
});
