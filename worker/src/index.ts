import { logger } from "@langfuse/shared/src/server";

import "./instrumentation"; // instrumenting the application
import app from "./app";
import { env } from "./env";

export const server = app.listen(env.PORT, () => {
  logger.info(`Listening: http://localhost:${env.PORT}`);
});
