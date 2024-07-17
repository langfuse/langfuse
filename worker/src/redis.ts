import Redis from "ioredis";
import { env } from "./env";
import logger from "./logger";

const createRedisClient = () => {
  try {
    return env.REDIS_CONNECTION_STRING
      ? new Redis(env.REDIS_CONNECTION_STRING, { maxRetriesPerRequest: null })
      : new Redis({
          host: String(env.REDIS_HOST),
          port: Number(env.REDIS_PORT),
          password: String(env.REDIS_AUTH),
          maxRetriesPerRequest: null, // Set to `null` to disable retrying
        });
  } catch (e) {
    logger.error(e, "Failed to connect to redis");
    return null;
  }
};

declare global {
  // eslint-disable-next-line no-var
  var redis: undefined | ReturnType<typeof createRedisClient>;
}

export const redis = globalThis.redis ?? createRedisClient();

if (env.NODE_ENV !== "production") globalThis.redis = redis;
