import {
  OrgEnrichedApiKey,
  createBasicAuthHeader,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import { Prisma, type PrismaClient, prisma } from "@langfuse/shared/src/db";
import { env } from "@/src/env.mjs";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { v4 } from "uuid";
import {
  clearRedisKeysByPatternSafely,
  createRedisTestClient,
  ensureRedisReady,
  getRedisKeysByPattern,
  getRedisTtl,
  getRedisValue,
  setRedisValue,
  type RedisTestClient,
} from "@/src/__tests__/server/redis-test-utils";

describe("Authenticate API calls", () => {
  type TestApiKeyFixture = {
    id: string;
    auth: string;
    publicKey: string;
    secretKey: string;
    orgId: string;
    projectId: string;
    note: string;
  };

  let testApiKey: TestApiKeyFixture;

  const createRedisClient = (): RedisTestClient => {
    return createRedisTestClient({
      maxRetriesPerRequest: null,
    });
  };

  const getValidAuthHeader = () => testApiKey.auth;

  const getInvalidAuthHeader = () =>
    createBasicAuthHeader(
      testApiKey.publicKey,
      `${testApiKey.secretKey}-wrong`,
    );

  const createMissingAuthHeader = () =>
    createBasicAuthHeader(`pk-missing-${v4()}`, `sk-missing-${v4()}`);

  const getApiKeyCacheKeys = async (
    redisClient: RedisTestClient,
    pattern = "api-key*",
  ) => {
    return await getRedisKeysByPattern(redisClient, pattern);
  };

  const clearApiKeyCacheSafely = async (redisClient: RedisTestClient) => {
    await clearRedisKeysByPatternSafely(redisClient, "api-key*");
  };

  beforeEach(async () => {
    const fixture = await createOrgProjectAndApiKey({ plan: "Hobby" });
    const note = "seeded key";
    const createdApiKey = await prisma.apiKey.findUniqueOrThrow({
      where: { publicKey: fixture.publicKey },
    });
    await prisma.apiKey.update({
      where: { id: createdApiKey.id },
      data: { note },
    });
    testApiKey = {
      id: createdApiKey.id,
      auth: fixture.auth,
      publicKey: fixture.publicKey,
      secretKey: fixture.secretKey,
      orgId: fixture.orgId,
      projectId: fixture.projectId,
      note,
    };
  });

  describe("validates without redis", () => {
    it("should create new api key", async () => {
      const auth = await new ApiAuthService(
        prisma,
        null,
      ).verifyAuthHeaderAndReturnScope(getValidAuthHeader());

      expect(auth.validKey).toBe(true);

      const apiKey = await prisma.apiKey.findUnique({
        where: { publicKey: testApiKey.publicKey },
      });
      expect(apiKey).not.toBeNull();
      expect(apiKey?.fastHashedSecretKey).not.toBeNull();
    });

    it("should create new api key and succeed with new key", async () => {
      const auth = await new ApiAuthService(
        prisma,
        null,
      ).verifyAuthHeaderAndReturnScope(getValidAuthHeader());
      expect(auth.validKey).toBe(true);

      const apiKey = await prisma.apiKey.findUnique({
        where: { publicKey: testApiKey.publicKey },
      });
      expect(apiKey).not.toBeNull();
      expect(apiKey?.fastHashedSecretKey).not.toBeNull();

      const auth2 = await new ApiAuthService(
        prisma,
        null,
      ).verifyAuthHeaderAndReturnScope(getValidAuthHeader());
      expect(auth2.validKey).toBe(true);
    });

    it("should create new api key with stripe data and succeed with new key", async () => {
      await prisma.organization.update({
        where: {
          id: testApiKey.orgId,
        },
        data: {
          cloudConfig: {
            stripe: {
              customerId: "cus_test123",
              activeSubscriptionId: "sub_test123",
              activeProductId: "prod_test123",
            },
          },
        },
      });

      await new ApiAuthService(prisma, null).verifyAuthHeaderAndReturnScope(
        getValidAuthHeader(),
      );

      const auth = await new ApiAuthService(
        prisma,
        null,
      ).verifyAuthHeaderAndReturnScope(getValidAuthHeader());
      expect(auth.validKey).toBe(true);

      if (auth.validKey) {
        expect(auth.scope.orgId).toBe(testApiKey.orgId);
        expect(auth.scope.plan).toBe("cloud:hobby");
        expect(auth.scope.rateLimitOverrides).toEqual([]);
      }

      const apiKey = await prisma.apiKey.findUnique({
        where: { publicKey: testApiKey.publicKey },
      });
      expect(apiKey).not.toBeNull();
      expect(apiKey?.fastHashedSecretKey).not.toBeNull();

      await prisma.organization.update({
        where: {
          id: testApiKey.orgId,
        },
        data: {
          cloudConfig: Prisma.JsonNull,
        },
      });
    });

    it("should create new api key with custom rate limits and succeed with new key", async () => {
      await prisma.organization.update({
        where: {
          id: testApiKey.orgId,
        },
        data: {
          cloudConfig: {
            rateLimitOverrides: [
              {
                resource: "ingestion",
                points: 100,
                durationInSec: 60,
              },
            ],
          },
        },
      });

      await new ApiAuthService(prisma, null).verifyAuthHeaderAndReturnScope(
        getValidAuthHeader(),
      );

      const auth = await new ApiAuthService(
        prisma,
        null,
      ).verifyAuthHeaderAndReturnScope(getValidAuthHeader());
      expect(auth.validKey).toBe(true);

      if (auth.validKey) {
        expect(auth.scope.orgId).toBe(testApiKey.orgId);
        expect(auth.scope.plan).toBe("cloud:hobby");
        expect(auth.scope.rateLimitOverrides).toEqual([
          {
            resource: "ingestion",
            points: 100,
            durationInSec: 60,
          },
        ]);
      }

      const apiKey = await prisma.apiKey.findUnique({
        where: { publicKey: testApiKey.publicKey },
      });
      expect(apiKey).not.toBeNull();
      expect(apiKey?.fastHashedSecretKey).not.toBeNull();

      await prisma.organization.update({
        where: {
          id: testApiKey.orgId,
        },
        data: {
          cloudConfig: Prisma.JsonNull,
        },
      });
    });

    it("should fail on wrong api key with new key", async () => {
      const auth = await new ApiAuthService(
        prisma,
        null,
      ).verifyAuthHeaderAndReturnScope(getValidAuthHeader());
      expect(auth.validKey).toBe(true);

      const apiKey = await prisma.apiKey.findUnique({
        where: { publicKey: testApiKey.publicKey },
      });

      expect(apiKey).not.toBeNull();
      expect(apiKey?.fastHashedSecretKey).not.toBeNull();

      const wrongAuth = await new ApiAuthService(
        prisma,
        null,
      ).verifyAuthHeaderAndReturnScope(getInvalidAuthHeader());
      expect(wrongAuth.validKey).toBe(false);
    });

    it("should fail on wrong api key without new key", async () => {
      const initialApiKey = await prisma.apiKey.findUnique({
        where: { publicKey: testApiKey.publicKey },
      });
      expect(initialApiKey).not.toBeNull();
      expect(initialApiKey?.fastHashedSecretKey).toBeNull();

      const auth = await new ApiAuthService(
        prisma,
        null,
      ).verifyAuthHeaderAndReturnScope(getInvalidAuthHeader());
      expect(auth.validKey).toBe(false);

      const apiKey = await prisma.apiKey.findUnique({
        where: { publicKey: testApiKey.publicKey },
      });
      expect(apiKey).not.toBeNull();
      expect(apiKey?.fastHashedSecretKey).toBeNull();
    });
  });

  describe("validates with redis", () => {
    let redis: RedisTestClient;

    beforeAll(async () => {
      redis = createRedisClient();
      await ensureRedisReady(redis);
    }, 20_000);

    beforeEach(async () => {
      if (redis.status === "close" || redis.status === "end") {
        redis = createRedisClient();
      }
      await ensureRedisReady(redis);
      // if we do not remove the key, it will remain in the cache and
      // calling the test twice will not add the key to the cache
      await clearApiKeyCacheSafely(redis);
    }, 20_000);

    afterEach(async () => {
      // if we do not remove the key, it will remain in the cache and
      // calling the test twice will not add the key to the cache
      await clearApiKeyCacheSafely(redis);
    }, 20_000);

    afterAll(() => {
      redis.disconnect();
    }, 20_000);

    it("should create new api key and read from cache", async () => {
      // update the organization with a cloud config
      await prisma.organization.update({
        where: { id: testApiKey.orgId },
        data: {
          cloudConfig: {
            rateLimitOverrides: [
              {
                resource: "public-api",
                points: 1000,
                durationInSec: 60,
              },
              {
                resource: "ingestion",
              },
            ],
          },
        },
      });

      // first auth will generate the fast hashed api key
      await new ApiAuthService(prisma, redis).verifyAuthHeaderAndReturnScope(
        getValidAuthHeader(),
      );

      const apiKey = await prisma.apiKey.findUnique({
        where: { publicKey: testApiKey.publicKey },
      });

      expect(apiKey).not.toBeNull();
      expect(apiKey?.fastHashedSecretKey).not.toBeNull();

      const cachedKey = await getRedisValue(
        redis,
        `api-key:${apiKey?.fastHashedSecretKey}`,
      );
      expect(cachedKey).toBeNull();

      // second will add the key to redis
      await new ApiAuthService(prisma, redis).verifyAuthHeaderAndReturnScope(
        getValidAuthHeader(),
      );

      const cachedKey2 = await getRedisValue(
        redis,
        `api-key:${apiKey?.fastHashedSecretKey}`,
      );

      expect(cachedKey2).not.toBeNull();

      const parsed = OrgEnrichedApiKey.parse(JSON.parse(cachedKey2!));

      expect(parsed).toEqual({
        ...apiKey,
        orgId: testApiKey.orgId,
        plan: "cloud:hobby",
        rateLimitOverrides: [
          {
            resource: "public-api",
            points: 1000,
            durationInSec: 60,
          },
          {
            resource: "ingestion",
          },
        ],
        createdAt: apiKey?.createdAt.toISOString(),
        isIngestionSuspended: expect.anything(),
      });

      await prisma.organization.update({
        where: { id: testApiKey.orgId },
        data: {
          cloudConfig: Prisma.JsonNull,
        },
      });
    });

    it("should handle non-scoped key format gracefully and fallback to prisma", async () => {
      // update the organization with a cloud config
      await prisma.organization.update({
        where: { id: testApiKey.orgId },
        data: {
          cloudConfig: {
            rateLimitOverrides: [
              {
                resource: "public-api",
                points: 1000,
                durationInSec: 60,
              },
              {
                resource: "ingestion",
              },
            ],
          },
        },
      });

      // first auth will generate the fast hashed api key
      await new ApiAuthService(prisma, redis).verifyAuthHeaderAndReturnScope(
        getValidAuthHeader(),
      );

      const apiKey = await prisma.apiKey.findUnique({
        where: { publicKey: testApiKey.publicKey },
      });

      expect(apiKey).not.toBeNull();
      expect(apiKey?.fastHashedSecretKey).not.toBeNull();

      // Manually add a non-scoped key to Redis (missing the scope property)
      const nonScopedKey = {
        id: "seed-api-key",
        note: "seeded key",
        publicKey: testApiKey.publicKey,
        displaySecretKey: "sk-lf-...7890",
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        expiresAt: null,
        fastHashedSecretKey: apiKey?.fastHashedSecretKey,
        hashedSecretKey: apiKey?.hashedSecretKey,
        orgId: testApiKey.orgId,
        plan: "cloud:team",
        projectId: testApiKey.projectId,
        // scope property is intentionally missing
      };

      // Add the non-scoped key to Redis
      await setRedisValue(
        redis,
        `api-key:${apiKey?.fastHashedSecretKey}`,
        JSON.stringify(nonScopedKey),
      );

      // Verify the key is in Redis
      const cachedKey = await getRedisValue(
        redis,
        `api-key:${apiKey?.fastHashedSecretKey}`,
      );
      expect(cachedKey).not.toBeNull();

      // Parse should fail because the scope is missing
      expect(() => {
        OrgEnrichedApiKey.parse(JSON.parse(cachedKey!));
      }).toThrow("invalid_union");

      // Auth should still succeed by falling back to Postgres
      const verification = await new ApiAuthService(
        prisma,
        redis,
      ).verifyAuthHeaderAndReturnScope(getValidAuthHeader());

      expect(verification.validKey).toBe(true);

      // The invalid key should be removed from Redis
      const cachedKeyAfterAuth = await getRedisValue(
        redis,
        `api-key:${apiKey?.fastHashedSecretKey}`,
      );

      // A new valid key should be added to Redis after fallback to Postgres
      expect(cachedKeyAfterAuth).not.toBeNull();

      // The new key should be properly formatted with a scope
      const parsed = OrgEnrichedApiKey.parse(JSON.parse(cachedKeyAfterAuth!));

      expect(parsed).toEqual({
        ...apiKey,
        orgId: testApiKey.orgId,
        plan: "cloud:hobby",
        scope: "PROJECT", // Now the scope is present
        projectId: testApiKey.projectId,
        rateLimitOverrides: [
          {
            resource: "public-api",
            points: 1000,
            durationInSec: 60,
          },
          {
            resource: "ingestion",
          },
        ],
        createdAt: apiKey?.createdAt.toISOString(),
        isIngestionSuspended: expect.anything(),
      });

      await prisma.organization.update({
        where: { id: testApiKey.orgId },
        data: {
          cloudConfig: Prisma.JsonNull,
        },
      });
    });

    it("searching for non-existing key stores flag in redis and fails auth", async () => {
      // key does not exist in database
      const missingAuthHeader = createMissingAuthHeader();

      const verification = await new ApiAuthService(
        prisma,
        redis,
      ).verifyAuthHeaderAndReturnScope(missingAuthHeader);

      expect(verification.validKey).toBe(false);

      const redisKeys = await getApiKeyCacheKeys(redis, "api-key:*");
      expect(redisKeys.length).toBe(1);
      const redisValue = await getRedisValue(redis, redisKeys[0]);
      expect(redisValue).toBe('"api-key-non-existent"');
    });

    it("searching for non-existing key again fails auth", async () => {
      // key does not exist in database
      const missingAuthHeader = createMissingAuthHeader();

      const verification = await new ApiAuthService(
        prisma,
        redis,
      ).verifyAuthHeaderAndReturnScope(missingAuthHeader);

      expect(verification.validKey).toBe(false);

      const redisKeys = await getApiKeyCacheKeys(redis, "api-key:*");
      expect(redisKeys.length).toBe(1);
      const redisValue = await getRedisValue(redis, redisKeys[0]);
      expect(redisValue).toBe('"api-key-non-existent"');

      const verification2 = await new ApiAuthService(
        prisma,
        redis,
      ).verifyAuthHeaderAndReturnScope(missingAuthHeader);
      expect(verification2.validKey).toBe(false);

      const redisKeys2 = await getApiKeyCacheKeys(redis, "api-key:*");
      expect(redisKeys2.length).toBe(1);
      const redisValue2 = await getRedisValue(redis, redisKeys[0]);
      expect(redisValue2).toBe('"api-key-non-existent"');
    });

    it("prisma should not be used when reading cached keys", async () => {
      // Mock prisma
      const mockPrisma = {
        apiKey: {
          findUnique: jest.fn(),
        },
      };

      // first auth will generate the fast hashed api key
      await new ApiAuthService(prisma, redis).verifyAuthHeaderAndReturnScope(
        getValidAuthHeader(),
      );

      // second will add the key to redis
      const auth2 = await new ApiAuthService(
        prisma,
        redis,
      ).verifyAuthHeaderAndReturnScope(getValidAuthHeader());

      // third will read from redis only
      await new ApiAuthService(
        mockPrisma as unknown as PrismaClient,
        redis,
      ).verifyAuthHeaderAndReturnScope(getValidAuthHeader());

      expect(auth2.validKey).toBe(true);

      const apiKey = await prisma.apiKey.findUnique({
        where: { publicKey: testApiKey.publicKey },
      });
      expect(apiKey).not.toBeNull();
      expect(apiKey?.fastHashedSecretKey).not.toBeNull();

      // Ensure prisma was not called
      expect(mockPrisma.apiKey.findUnique).not.toHaveBeenCalled();

      const cachedKey = await getRedisValue(
        redis,
        `api-key:${apiKey?.fastHashedSecretKey}`,
      );
      expect(cachedKey).not.toBeNull();

      const parsed = OrgEnrichedApiKey.parse(JSON.parse(cachedKey!));

      expect(parsed).toEqual({
        id: expect.any(String),
        note: "seeded key",
        publicKey: testApiKey.publicKey,
        hashedSecretKey: expect.any(String),
        fastHashedSecretKey: expect.any(String),
        displaySecretKey: expect.any(String),
        createdAt: expect.any(String),
        lastUsedAt: null,
        expiresAt: null,
        isIngestionSuspended: expect.anything(),
        projectId: expect.any(String),
        orgId: testApiKey.orgId,
        plan: "cloud:hobby",
        scope: "PROJECT",
      });
    });

    it("ttl should be increased when reading from redis", async () => {
      // Mock prisma
      const mockPrisma = {
        apiKey: {
          findUnique: jest.fn(),
        },
      };

      // first auth will generate the fast hashed api key
      await new ApiAuthService(prisma, redis).verifyAuthHeaderAndReturnScope(
        getValidAuthHeader(),
      );

      // second will add the key to redis
      await new ApiAuthService(prisma, redis).verifyAuthHeaderAndReturnScope(
        getValidAuthHeader(),
      );

      // third will read from redis only
      await new ApiAuthService(
        mockPrisma as unknown as PrismaClient,
        redis,
      ).verifyAuthHeaderAndReturnScope(getValidAuthHeader());

      const apiKey = await prisma.apiKey.findUnique({
        where: { publicKey: testApiKey.publicKey },
      });
      expect(apiKey).not.toBeNull();
      expect(apiKey?.fastHashedSecretKey).not.toBeNull();

      const ttl = await getRedisTtl(
        redis,
        `api-key:${apiKey?.fastHashedSecretKey}`,
      );

      expect(ttl).toBeGreaterThan(env.LANGFUSE_CACHE_API_KEY_TTL_SECONDS - 2);

      // wait for 5 seconds
      await new Promise((resolve) => setTimeout(resolve, 5000));

      await new ApiAuthService(
        mockPrisma as unknown as PrismaClient,
        redis,
      ).verifyAuthHeaderAndReturnScope(getValidAuthHeader());

      const ttl2 = await getRedisTtl(
        redis,
        `api-key:${apiKey?.fastHashedSecretKey}`,
      );

      expect(ttl2).toBeGreaterThan(env.LANGFUSE_CACHE_API_KEY_TTL_SECONDS - 2);
    }, 10000);

    it("should delete API keys from cache and db", async () => {
      // first auth will generate the fast hashed api key
      await new ApiAuthService(prisma, redis).verifyAuthHeaderAndReturnScope(
        getValidAuthHeader(),
      );

      // second will add the key to redis
      const auth2 = await new ApiAuthService(
        prisma,
        redis,
      ).verifyAuthHeaderAndReturnScope(getValidAuthHeader());

      expect(auth2.validKey).toBe(true);

      const apiKey = await prisma.apiKey.findUnique({
        where: { publicKey: testApiKey.publicKey },
      });

      expect(apiKey).not.toBeNull();
      expect(apiKey?.fastHashedSecretKey).not.toBeNull();

      const cachedKey = await getRedisValue(
        redis,
        `api-key:${apiKey?.fastHashedSecretKey}`,
      );
      expect(cachedKey).not.toBeNull();

      const parsed = OrgEnrichedApiKey.parse(JSON.parse(cachedKey!));

      expect(parsed).toEqual({
        ...apiKey,
        orgId: testApiKey.orgId,
        plan: "cloud:hobby",
        createdAt: apiKey?.createdAt.toISOString(),
        scope: "PROJECT",
        isIngestionSuspended: expect.anything(),
      });

      await new ApiAuthService(prisma, redis).deleteApiKey(
        apiKey?.id!,
        apiKey?.projectId!,
        "PROJECT",
      );

      const deletedApiKey = await prisma.apiKey.findUnique({
        where: { id: apiKey?.id! },
      });
      expect(deletedApiKey).toBeNull();

      const deletedCachedKey = await getRedisValue(
        redis,
        `api-key:${apiKey?.fastHashedSecretKey}`,
      );
      expect(deletedCachedKey).toBeNull();
    });
  });

  describe("invalidates api keys in redis", () => {
    let redis: RedisTestClient;

    beforeAll(async () => {
      redis = createRedisClient();
      await ensureRedisReady(redis);
    }, 20_000);

    beforeEach(async () => {
      if (redis.status === "close" || redis.status === "end") {
        redis = createRedisClient();
      }
      await ensureRedisReady(redis);
      // if we do not remove the key, it will remain in the cache and
      // calling the test twice will not add the key to the cache
      await clearApiKeyCacheSafely(redis);
    }, 20_000);

    afterEach(async () => {
      // if we do not remove the key, it will remain in the cache and
      // calling the test twice will not add the key to the cache
      await clearApiKeyCacheSafely(redis);
    }, 20_000);

    afterAll(() => {
      redis.disconnect();
    }, 20_000);

    it("should invalidate organization API keys in redis", async () => {
      // put keys into cache
      await new ApiAuthService(prisma, redis).verifyAuthHeaderAndReturnScope(
        getValidAuthHeader(),
      );

      await new ApiAuthService(prisma, redis).verifyAuthHeaderAndReturnScope(
        getValidAuthHeader(),
      );

      const apiKey = await prisma.apiKey.findUnique({
        where: { publicKey: testApiKey.publicKey },
      });
      expect(apiKey).not.toBeNull();

      const cachedKey = await getRedisValue(
        redis,
        `api-key:${apiKey?.fastHashedSecretKey}`,
      );
      expect(cachedKey).not.toBeNull();

      await new ApiAuthService(prisma, redis).invalidateCachedOrgApiKeys(
        testApiKey.orgId,
      );

      const invalidatedCachedKey = await getRedisValue(
        redis,
        `api-key:${apiKey?.fastHashedSecretKey}`,
      );
      expect(invalidatedCachedKey).toBeNull();
    });

    it("if no keys in redis, invalidating org keys should do nothing", async () => {
      await prisma.apiKey.update({
        where: { publicKey: testApiKey.publicKey },
        data: {
          fastHashedSecretKey: Math.random().toString(36).substring(2, 15),
        },
      });

      await new ApiAuthService(prisma, redis).invalidateCachedOrgApiKeys(
        testApiKey.orgId,
      );

      const keys = await getApiKeyCacheKeys(redis);
      expect(keys.length).toBe(0);
    });

    it("if no keys in redis, invalidating org keys without fast hash should do nothing", async () => {
      await new ApiAuthService(prisma, redis).invalidateCachedOrgApiKeys(
        testApiKey.orgId,
      );

      const keys = await getApiKeyCacheKeys(redis);
      expect(keys.length).toBe(0);
    });

    it("should invalidate project API keys in redis", async () => {
      // put keys into cache
      await new ApiAuthService(prisma, redis).verifyAuthHeaderAndReturnScope(
        getValidAuthHeader(),
      );
      await new ApiAuthService(prisma, redis).verifyAuthHeaderAndReturnScope(
        getValidAuthHeader(),
      );

      const apiKey = await prisma.apiKey.findUnique({
        where: { publicKey: testApiKey.publicKey },
      });
      expect(apiKey).not.toBeNull();

      const cachedKey = await getRedisValue(
        redis,
        `api-key:${apiKey?.fastHashedSecretKey}`,
      );
      expect(cachedKey).not.toBeNull();

      await new ApiAuthService(prisma, redis).invalidateCachedProjectApiKeys(
        testApiKey.projectId,
      );

      const invalidatedCachedKey = await getRedisValue(
        redis,
        `api-key:${apiKey?.fastHashedSecretKey}`,
      );
      expect(invalidatedCachedKey).toBeNull();
    });

    it("if no keys in redis, invalidating project keys should do nothing", async () => {
      await prisma.apiKey.update({
        where: { publicKey: testApiKey.publicKey },
        data: {
          fastHashedSecretKey: Math.random().toString(36).substring(2, 15),
        },
      });

      await new ApiAuthService(prisma, redis).invalidateCachedProjectApiKeys(
        testApiKey.projectId,
      );

      const keys = await getApiKeyCacheKeys(redis);
      expect(keys.length).toBe(0);
    });

    it("if no keys in redis, invalidating project keys without fast hash should do nothing", async () => {
      await prisma.apiKey.update({
        where: { publicKey: testApiKey.publicKey },
        data: {
          fastHashedSecretKey: Math.random().toString(36).substring(2, 15),
        },
      });

      await new ApiAuthService(prisma, redis).invalidateCachedProjectApiKeys(
        testApiKey.projectId,
      );

      const keys = await getApiKeyCacheKeys(redis);
      expect(keys.length).toBe(0);
    });
  });
});
