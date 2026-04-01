import {
  createNewRedisInstance,
  safeMultiDel,
  scanKeys,
} from "@langfuse/shared/src/server";
import type { RedisOptions } from "ioredis";

export type RedisTestClient = NonNullable<
  ReturnType<typeof createNewRedisInstance>
>;

const DEFAULT_READY_ATTEMPTS = 20;
const DEFAULT_READY_DELAY_MS = 250;
const DEFAULT_SET_TTL_SECONDS = 3600;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const createRedisTestClient = (
  options: Partial<RedisOptions> = {},
): RedisTestClient => {
  const client = createNewRedisInstance(options);

  if (!client) {
    throw new Error("Failed to initialize Redis client for tests.");
  }

  return client;
};

export const isRedisConnectionClosedError = (error: unknown): boolean =>
  error instanceof Error && error.message.includes("Connection is closed");

export const ensureRedisReady = async (
  redisClient: RedisTestClient,
  attempts = DEFAULT_READY_ATTEMPTS,
  delayMs = DEFAULT_READY_DELAY_MS,
): Promise<void> => {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await redisClient.ping();
      return;
    } catch (error) {
      lastError = error;
      if (isRedisConnectionClosedError(error)) {
        try {
          await redisClient.connect();
        } catch {
          // Ignore reconnect errors and retry ping.
        }
      }
      await sleep(delayMs);
    }
  }

  throw lastError ?? new Error("Redis client not ready");
};

export const getRedisKeysByPattern = async (
  redisClient: RedisTestClient,
  pattern: string,
): Promise<string[]> => {
  return await scanKeys(redisClient, pattern);
};

export const clearRedisKeysByPattern = async (
  redisClient: RedisTestClient,
  pattern: string,
): Promise<void> => {
  const keys = await getRedisKeysByPattern(redisClient, pattern);
  if (keys.length > 0) {
    await safeMultiDel(redisClient, keys);
  }
};

export const clearRedisKeysByPatternSafely = async (
  redisClient: RedisTestClient,
  pattern: string,
): Promise<void> => {
  try {
    await clearRedisKeysByPattern(redisClient, pattern);
  } catch (error) {
    if (!isRedisConnectionClosedError(error)) {
      throw error;
    }
  }
};

export const getRedisValue = async (
  redisClient: RedisTestClient,
  key: string,
) => {
  await ensureRedisReady(redisClient);
  return await redisClient.get(key);
};

export const setRedisValue = async (
  redisClient: RedisTestClient,
  key: string,
  value: string,
  ttlSeconds = DEFAULT_SET_TTL_SECONDS,
) => {
  await ensureRedisReady(redisClient);
  return await redisClient.set(key, value, "EX", ttlSeconds);
};

export const getRedisTtl = async (
  redisClient: RedisTestClient,
  key: string,
) => {
  await ensureRedisReady(redisClient);
  return await redisClient.ttl(key);
};
