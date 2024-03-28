import app from "./app";
import { env } from "./env";
import logger from "./logger";

app.listen(env.PORT, () => {
  logger.info(`Listening: http://localhost:${env.PORT}`);
});
