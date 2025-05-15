import Redis, { RedisOptions } from "ioredis";
import fs from "fs";
import { env } from "../../env";
import { logger } from "../logger";

const defaultRedisOptions: Partial<RedisOptions> = {
  maxRetriesPerRequest: null,
  enableAutoPipelining: env.REDIS_ENABLE_AUTO_PIPELINING === "true",
};

export const redisQueueRetryOptions: Partial<RedisOptions> = {
  retryStrategy: (times: number) => {
    if (times >= 5) {
      // A few retries are expected and no cause for action.
      logger.warn(`Connection to redis lost. Retry attempt: ${times}`);
    }
    // Retries forever. Waits at least 1s and at most 20s between retries.
    return Math.max(Math.min(Math.exp(times), 20000), 1000);
  },
  reconnectOnError: (err) => {
    // Reconnects on READONLY errors and auto-retries the command.
    logger.warn(`Redis connection error: ${err.message}`);
    return err.message.includes("READONLY") ? 2 : false;
  },
};

export const createNewRedisInstance = (
  additionalOptions: Partial<RedisOptions> = {},
) => {
  const tlsEnabled = env.REDIS_TLS_ENABLED === "true";

  const tlsOptions = tlsEnabled
    ? {
        tls: {
          ca: env.REDIS_TLS_CA_PATH
            ? fs.readFileSync(env.REDIS_TLS_CA_PATH)
            : undefined,
          cert: env.REDIS_TLS_CERT_PATH
            ? fs.readFileSync(env.REDIS_TLS_CERT_PATH)
            : undefined,
          key: env.REDIS_TLS_KEY_PATH
            ? fs.readFileSync(env.REDIS_TLS_KEY_PATH)
            : undefined,
        },
      }
    : {};

  const instance = env.REDIS_CONNECTION_STRING
    ? new Redis(env.REDIS_CONNECTION_STRING, {
        ...defaultRedisOptions,
        ...additionalOptions,
        ...tlsOptions,
      })
    : env.REDIS_HOST
      ? new Redis({
          host: String(env.REDIS_HOST),
          port: Number(env.REDIS_PORT),
          password: String(env.REDIS_AUTH),
          ...defaultRedisOptions,
          ...additionalOptions,
          ...tlsOptions,
        })
      : null;

  instance?.on("error", (error) => {
    logger.error("Redis error", error);
  });

  return instance;
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
