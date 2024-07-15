import Redis, { Result, Callback } from "ioredis";
import { env } from "./env";
import logger from "./logger";

export const SCRIPT = `
local key = KEYS[1]
local maxNumberElements = tonumber(KEYS[2])
local maxScore = tonumber(KEYS[3])

local elements = redis.call('ZRANGEBYSCORE', key, '-inf', maxScore, 'limit', 0, maxNumberElements)
if #elements > 0 then
  return redis.call('ZMPOP', 1, key, 'MIN', 'count', #elements)
else
  return {}
end
`;

const createRedisClient = () => {
  try {
    const redis = env.REDIS_CONNECTION_STRING
      ? new Redis(env.REDIS_CONNECTION_STRING, { maxRetriesPerRequest: null })
      : new Redis({
          host: String(env.REDIS_HOST),
          port: Number(env.REDIS_PORT),
          password: String(env.REDIS_AUTH),
          maxRetriesPerRequest: null, // Set to `null` to disable retrying
        });

    redis.defineCommand("popSortedSetByRange", {
      numberOfKeys: 3,
      lua: SCRIPT,
    });

    return redis;
  } catch (e) {
    logger.error(e, "Failed to connect to redis");
    return null;
  }
};

declare module "ioredis" {
  interface RedisCommander<Context> {
    popSortedSetByRange(
      key: string,
      maxNumberElements: number,
      maxScore: number,
      callback?: Callback<string[]>
    ): Result<[string, [string, string][]], Context>;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var redis: undefined | ReturnType<typeof createRedisClient>;
}

export const redis = globalThis.redis ?? createRedisClient();

if (env.NODE_ENV !== "production") globalThis.redis = redis;
