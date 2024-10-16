import Redis, { RedisOptions } from "ioredis";
import { env } from "../../env";
import { logger } from "../logger";

/**
 * Create a new redis client instance. We automatically disable retries per request which means that commands will wait
 * forever until connection is live again, enable auto pipelining, and auto-reconnect on READONLY errors which
 * is necessary for AWS ElastiCache failovers. With return `2` we also resend the command that failed automatically.
 * Additional options accepts a RedisOptions object which extends the default and overwrites for overlapping keys.
 * @param additionalOptions
 */
export const createNewRedisInstance = (
  additionalOptions: Partial<RedisOptions> = {},
) => {
  return env.REDIS_CONNECTION_STRING
    ? new Redis(env.REDIS_CONNECTION_STRING, {
        maxRetriesPerRequest: null,
        enableAutoPipelining: env.REDIS_ENABLE_AUTO_PIPELINING === "true",
        retryStrategy: (times: number) => {
          // https://docs.bullmq.io/guide/going-to-production#retrystrategy
          // Retries forever. Waits at least 1s and at most 20s between retries.
          logger.debug(`Connection to redis lost. Retry attempt: ${times}`);
          return Math.max(Math.min(Math.exp(times), 20000), 1000);
        },
        reconnectOnError: (err) =>
          err.message.includes("READONLY") ? 2 : false,
        ...additionalOptions,
      })
    : env.REDIS_HOST
      ? new Redis({
          host: String(env.REDIS_HOST),
          port: Number(env.REDIS_PORT),
          password: String(env.REDIS_AUTH),
          maxRetriesPerRequest: null,
          enableAutoPipelining: env.REDIS_ENABLE_AUTO_PIPELINING === "true",
          retryStrategy: (times: number) => {
            // https://docs.bullmq.io/guide/going-to-production#retrystrategy
            // Retries forever. Waits at least 1s and at most 20s between retries.
            logger.debug(`Connection to redis lost. Retry attempt: ${times}`);
            return Math.max(Math.min(Math.exp(times), 20000), 1000);
          },
          reconnectOnError: (err) =>
            err.message.includes("READONLY") ? 2 : false,
          ...additionalOptions,
        })
      : null;
};

const createRedisClient = () => {
  try {
    return createNewRedisInstance();
  } catch (e) {
    logger.error("Failed to connect to redis", e);
    return null;
  }
};
declare global {
  // eslint-disable-next-line no-var
  var redis: undefined | ReturnType<typeof createRedisClient>;
}

export const redis = globalThis.redis ?? createRedisClient();

if (env.NODE_ENV !== "production") globalThis.redis = redis;
