import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { env } from "@/src/env.mjs";
import type * as SharedServer from "@langfuse/shared/src/server";
import {
  API_KEY_CACHE_PATTERN,
  createApiKeyCacheKey,
  redis,
} from "@langfuse/shared/src/server";
import handler from "../../pages/api/admin/api-keys";
import {
  clearRedisKeysByPatternSafely,
  createRedisTestClient,
  ensureRedisReady,
  getRedisValue,
  setRedisValue,
  type RedisTestClient,
} from "@/src/__tests__/server/redis-test-utils";

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedServer>();
  const { randomUUID } = await import("node:crypto");
  return {
    ...actual,
    redis: actual.createNewRedisInstance({
      keyPrefix: `admin-api-keys-test:${randomUUID()}:`,
    }),
  };
});

describe("Admin API keys route", () => {
  const ADMIN_API_KEY = "test-admin-api-key";
  const originalAdminApiKey = env.ADMIN_API_KEY;
  const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;

  const getRedisClient = (): RedisTestClient => {
    if (!redis) {
      throw new Error("Redis is required for admin API key cache tests.");
    }

    return redis;
  };

  beforeAll(() => {
    (env as any).ADMIN_API_KEY = ADMIN_API_KEY;
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
  });

  beforeEach(async () => {
    const redisClient = getRedisClient();
    await ensureRedisReady(redisClient);
    await clearRedisKeysByPatternSafely(redisClient, API_KEY_CACHE_PATTERN);
    await clearRedisKeysByPatternSafely(redisClient, "other-cache:*");
  });

  afterEach(async () => {
    const redisClient = getRedisClient();
    await clearRedisKeysByPatternSafely(redisClient, API_KEY_CACHE_PATTERN);
    await clearRedisKeysByPatternSafely(redisClient, "other-cache:*");
  });

  afterAll(async () => {
    (env as any).ADMIN_API_KEY = originalAdminApiKey;
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
    redis?.disconnect();
    const actual = await vi.importActual<typeof SharedServer>(
      "@langfuse/shared/src/server",
    );
    actual.redis?.disconnect();
  });

  it("invalidates all cached API keys without deleting other redis entries", async () => {
    const redisClient = getRedisClient();
    const existingApiKeyCacheKey = createApiKeyCacheKey("existing-key");
    const missingApiKeyCacheKey = createApiKeyCacheKey("missing-key");

    await setRedisValue(redisClient, existingApiKeyCacheKey, "cached-api-key");
    await setRedisValue(
      redisClient,
      missingApiKeyCacheKey,
      '"api-key-non-existent"',
    );
    await setRedisValue(redisClient, "other-cache:existing-key", "untouched");

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      headers: {
        authorization: `Bearer ${ADMIN_API_KEY}`,
      },
      body: {
        action: "invalidate-all",
      },
    });

    const otherClient = createRedisTestClient({ keyPrefix: "" });
    const otherApiKey = createApiKeyCacheKey(randomUUID());
    try {
      await setRedisValue(otherClient, otherApiKey, "other-suite");
      await handler(req, res);

      expect(await getRedisValue(otherClient, otherApiKey)).toBe("other-suite");
      expect(res._getStatusCode()).toBe(200);
      const responseBody = res._getJSONData();
      expect(responseBody).toEqual({
        message: "All cached API keys invalidated",
        invalidatedCount: expect.any(Number),
      });
      expect(responseBody.invalidatedCount).toBeGreaterThanOrEqual(2);
      expect(
        await getRedisValue(redisClient, existingApiKeyCacheKey),
      ).toBeNull();
      expect(
        await getRedisValue(redisClient, missingApiKeyCacheKey),
      ).toBeNull();
      expect(await getRedisValue(redisClient, "other-cache:existing-key")).toBe(
        "untouched",
      );
    } finally {
      await otherClient.del(otherApiKey);
      otherClient.disconnect();
    }
  });
});
