import "./instrumentation"; // instrumenting the application
import app from "./app";
import { env } from "./env";
import { logger } from "@langfuse/shared/src/server";

export const server = app.listen(env.PORT, () => {
  logger.info(`Listening: http://localhost:${env.PORT}`);
});
