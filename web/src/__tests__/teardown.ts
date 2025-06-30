export default async function teardown() {
  const { redis, logger } = await import("@langfuse/shared/src/server");
  logger.debug(`Redis status ${redis?.status}`);
  if (!redis) {
    return;
  }
  if (redis.status === "end" || redis.status === "close") {
    logger.debug("Redis connection already closed");
    return;
  }
  redis?.disconnect();
  logger.debug("Teardown complete");

  logger.debug("Checking for leaked handles");
  require("leaked-handles").set({
    fullStack: true, // use full stack traces
    debugSockets: true, // pretty print tcp thrown exceptions.
  });
}
