import {
  createBasicAuthHeader,
  createNewRedisInstance,
  createOrgProjectAndApiKey,
  getDisplaySecretKey,
  hashSecretKey,
  OrgEnrichedApiKey,
  safeMultiDel,
  scanKeys,
} from "@langfuse/shared/src/server";
import { Prisma, type PrismaClient, prisma } from "@langfuse/shared/src/db";
import { env } from "@/src/env.mjs";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";

describe("Authenticate API calls", () => {
  let orgId: string;
  let projectId: string;
  const seededApiKey = {
    secret: "sk-lf-1234567890",
    public: "pk-lf-1234567890",
  };
  const validAuthHeader = createBasicAuthHeader(
    seededApiKey.public,
    seededApiKey.secret,
  );
  const invalidAuthHeader = createBasicAuthHeader(
    seededApiKey.public,
    "sk-lf-1234567891",
  );

  beforeEach(async () => {
    const setup = await createOrgProjectAndApiKey();
    orgId = setup.orgId;
    projectId = setup.projectId;
    // Remove default key created by helper to keep each test explicit.
    await prisma.apiKey.deleteMany({
      where: { projectId },
    });
    await prisma.apiKey.deleteMany();
  });
  afterEach(async () => {
    await prisma.apiKey.deleteMany();
  });

  describe("validates without redis", () => {
    it("should create new api key", async () => {
      await createAPIKey();
      const auth = await new ApiAuthService(
        prisma,
        null,
      ).verifyAuthHeaderAndReturnScope(validAuthHeader);

      expect(auth.validKey).toBe(true);

      const apiKey = await prisma.apiKey.findUnique({
        where: { publicKey: "pk-lf-1234567890" },
      });
      expect(apiKey).not.toBeNull();
      expect(apiKey?.fastHashedSecretKey).not.toBeNull();
    });

    it("should create new api key and succeed with new key", async () => {
      await createAPIKey();
      const auth = await new ApiAuthService(
        prisma,
        null,
      ).verifyAuthHeaderAndReturnScope(validAuthHeader);
      expect(auth.validKey).toBe(true);

      const apiKey = await prisma.apiKey.findUnique({
        where: { publicKey: "pk-lf-1234567890" },
      });
      expect(apiKey).not.toBeNull();
      expect(apiKey?.fastHashedSecretKey).not.toBeNull();

      const auth2 = await new ApiAuthService(
        prisma,
        null,
      ).verifyAuthHeaderAndReturnScope(validAuthHeader);
      expect(auth2.validKey).toBe(true);
    });

    it("should create new api key with stripe data and succeed with new key", async () => {
      await createAPIKey();

      await prisma.organization.update({
        where: {
          id: orgId,
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
        validAuthHeader,
      );

      const auth = await new ApiAuthService(
        prisma,
        null,
      ).verifyAuthHeaderAndReturnScope(validAuthHeader);
      expect(auth.validKey).toBe(true);

      if (auth.validKey) {
        expect(auth.scope.orgId).toBe(orgId);
        expect(auth.scope.plan).toBe("cloud:hobby");
        expect(auth.scope.rateLimitOverrides).toEqual([]);
      }

      const apiKey = await prisma.apiKey.findUnique({
        where: { publicKey: "pk-lf-1234567890" },
      });
      expect(apiKey).not.toBeNull();
      expect(apiKey?.fastHashedSecretKey).not.toBeNull();

      await prisma.organization.update({
        where: {
          id: orgId,
        },
        data: {
          cloudConfig: Prisma.JsonNull,
        },
      });
    });

    it("should create new api key with custom rate limits and succeed with new key", async () => {
      await createAPIKey();

      await prisma.organization.update({
        where: {
          id: orgId,
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
        validAuthHeader,
      );

      const auth = await new ApiAuthService(
        prisma,
        null,
      ).verifyAuthHeaderAndReturnScope(validAuthHeader);
      expect(auth.validKey).toBe(true);

      if (auth.validKey) {
        expect(auth.scope.orgId).toBe(orgId);
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
        where: { publicKey: "pk-lf-1234567890" },
      });
      expect(apiKey).not.toBeNull();
      expect(apiKey?.fastHashedSecretKey).not.toBeNull();

      await prisma.organization.update({
        where: {
          id: orgId,
        },
        data: {
          cloudConfig: Prisma.JsonNull,
        },
      });
    });

    it("should fail on wrong api key with new key", async () => {
      await createAPIKey();
      const auth = await new ApiAuthService(
        prisma,
        null,
      ).verifyAuthHeaderAndReturnScope(validAuthHeader);
      expect(auth.validKey).toBe(true);

      const apiKey = await prisma.apiKey.findUnique({
        where: { publicKey: "pk-lf-1234567890" },
      });

      expect(apiKey).not.toBeNull();
      expect(apiKey?.fastHashedSecretKey).not.toBeNull();

      const wrongAuth = await new ApiAuthService(
        prisma,
        null,
      ).verifyAuthHeaderAndReturnScope(invalidAuthHeader);
      expect(wrongAuth.validKey).toBe(false);
    });

    it("should fail on wrong api key without new key", async () => {
      await createAPIKey();
      const initialApiKey = await prisma.apiKey.findUnique({
        where: { publicKey: "pk-lf-1234567890" },
      });
      expect(initialApiKey).not.toBeNull();
      expect(initialApiKey?.fastHashedSecretKey).toBeNull();

      const auth = await new ApiAuthService(
        prisma,
        null,
      ).verifyAuthHeaderAndReturnScope(invalidAuthHeader);
      expect(auth.validKey).toBe(false);

      const apiKey = await prisma.apiKey.findUnique({
        where: { publicKey: "pk-lf-1234567890" },
      });
      expect(apiKey).not.toBeNull();
      expect(apiKey?.fastHashedSecretKey).toBeNull();
    });
  });

  describe("validates with redis", () => {
    const redis = createNewRedisInstance({
      maxRetriesPerRequest: null,
    });

    if (!redis) {
      throw new Error("Failed to initialize Redis for api-auth tests");
    }

    beforeEach(async () => {
      // if we do not remove the key, it will remain in the cache and
      // calling the test twice will not add the key to the cache

      const keys = await scanKeys(redis, "api-key*");
      if (keys.length > 0) {
        await safeMultiDel(redis, keys);
      }
    });

    afterEach(async () => {
      // if we do not remove the key, it will remain in the cache and
      // calling the test twice will not add the key to the cache
      const keys = await scanKeys(redis, "api-key*");
      if (keys.length > 0) {
        await safeMultiDel(redis, keys);
      }
    });

    afterAll(async () => {
      redis.disconnect();
    });

    it("should create new api key and read from cache", async () => {
      await createAPIKey();

      // update the organization with a cloud config
      await prisma.organization.update({
        where: { id: orgId },
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
        validAuthHeader,
      );

      const apiKey = await prisma.apiKey.findUnique({
        where: { publicKey: "pk-lf-1234567890" },
      });

      expect(apiKey).not.toBeNull();
      expect(apiKey?.fastHashedSecretKey).not.toBeNull();

      const cachedKey = await redis.get(
        `api-key:${apiKey?.fastHashedSecretKey}`,
      );
      expect(cachedKey).toBeNull();

      // second will add the key to redis
      await new ApiAuthService(prisma, redis).verifyAuthHeaderAndReturnScope(
        validAuthHeader,
      );

      const cachedKey2 = await redis.get(
        `api-key:${apiKey?.fastHashedSecretKey}`,
      );

      expect(cachedKey2).not.toBeNull();

      const parsed = OrgEnrichedApiKey.parse(JSON.parse(cachedKey2!));

      expect(parsed).toEqual({
        ...apiKey,
        orgId: orgId,
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
        where: { id: orgId },
        data: {
          cloudConfig: Prisma.JsonNull,
        },
      });
    });

    it("should handle non-scoped key format gracefully and fallback to prisma", async () => {
      await createAPIKey();

      // update the organization with a cloud config
      await prisma.organization.update({
        where: { id: orgId },
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
        validAuthHeader,
      );

      const apiKey = await prisma.apiKey.findUnique({
        where: { publicKey: "pk-lf-1234567890" },
      });

      expect(apiKey).not.toBeNull();
      expect(apiKey?.fastHashedSecretKey).not.toBeNull();

      // Manually add a non-scoped key to Redis (missing the scope property)
      const nonScopedKey = {
        id: "seed-api-key",
        note: "seeded key",
        publicKey: "pk-lf-1234567890",
        displaySecretKey: "sk-lf-...7890",
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        expiresAt: null,
        fastHashedSecretKey: apiKey?.fastHashedSecretKey,
        hashedSecretKey: apiKey?.hashedSecretKey,
        orgId: orgId,
        plan: "cloud:team",
        projectId: projectId,
        // scope property is intentionally missing
      };

      // Add the non-scoped key to Redis
      await redis.set(
        `api-key:${apiKey?.fastHashedSecretKey}`,
        JSON.stringify(nonScopedKey),
        "EX",
        3600, // 1 hour TTL
      );

      // Verify the key is in Redis
      const cachedKey = await redis.get(
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
      ).verifyAuthHeaderAndReturnScope(validAuthHeader);

      expect(verification.validKey).toBe(true);

      // The invalid key should be removed from Redis
      const cachedKeyAfterAuth = await redis.get(
        `api-key:${apiKey?.fastHashedSecretKey}`,
      );

      // A new valid key should be added to Redis after fallback to Postgres
      expect(cachedKeyAfterAuth).not.toBeNull();

      // The new key should be properly formatted with a scope
      const parsed = OrgEnrichedApiKey.parse(JSON.parse(cachedKeyAfterAuth!));

      expect(parsed).toEqual({
        ...apiKey,
        orgId: orgId,
        plan: "cloud:hobby",
        scope: "PROJECT", // Now the scope is present
        projectId: projectId,
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
        where: { id: orgId },
        data: {
          cloudConfig: Prisma.JsonNull,
        },
      });
    });

    it("searching for non-existing key stores flag in redis and fails auth", async () => {
      // key does not exist in database

      const verification = await new ApiAuthService(
        prisma,
        redis,
      ).verifyAuthHeaderAndReturnScope(validAuthHeader);

      expect(verification.validKey).toBe(false);

      const redisKeys = await scanKeys(redis, "api-key:*");
      expect(redisKeys.length).toBe(1);
      const redisValue = await redis.get(redisKeys[0]);
      expect(redisValue).toBe('"api-key-non-existent"');
    });

    it("searching for non-existing key again fails auth", async () => {
      // key does not exist in database

      const verification = await new ApiAuthService(
        prisma,
        redis,
      ).verifyAuthHeaderAndReturnScope(validAuthHeader);

      expect(verification.validKey).toBe(false);

      const redisKeys = await scanKeys(redis, "api-key:*");
      expect(redisKeys.length).toBe(1);
      const redisValue = await redis.get(redisKeys[0]);
      expect(redisValue).toBe('"api-key-non-existent"');

      const verification2 = await new ApiAuthService(
        prisma,
        redis,
      ).verifyAuthHeaderAndReturnScope(validAuthHeader);
      expect(verification2.validKey).toBe(false);

      const redisKeys2 = await scanKeys(redis, "api-key:*");
      expect(redisKeys2.length).toBe(1);
      const redisValue2 = await redis.get(redisKeys[0]);
      expect(redisValue2).toBe('"api-key-non-existent"');
    });

    it("prisma should not be used when reading cached keys", async () => {
      await createAPIKey();

      // Mock prisma
      const mockPrisma = {
        apiKey: {
          findUnique: jest.fn(),
        },
      };

      // first auth will generate the fast hashed api key
      await new ApiAuthService(prisma, redis).verifyAuthHeaderAndReturnScope(
        validAuthHeader,
      );

      // second will add the key to redis
      const auth2 = await new ApiAuthService(
        prisma,
        redis,
      ).verifyAuthHeaderAndReturnScope(validAuthHeader);

      // third will read from redis only
      await new ApiAuthService(
        mockPrisma as unknown as PrismaClient,
        redis,
      ).verifyAuthHeaderAndReturnScope(validAuthHeader);

      expect(auth2.validKey).toBe(true);

      // Ensure prisma was not called
      expect(mockPrisma.apiKey.findUnique).not.toHaveBeenCalled();

      const apiKey = await prisma.apiKey.findUnique({
        where: { publicKey: seededApiKey.public },
      });
      expect(apiKey?.fastHashedSecretKey).toBeDefined();

      const cachedKey = await redis.get(
        `api-key:${apiKey?.fastHashedSecretKey}`,
      );
      expect(cachedKey).not.toBeNull();

      const parsed = OrgEnrichedApiKey.parse(JSON.parse(cachedKey!));

      expect(parsed).toEqual({
        id: expect.any(String),
        note: "seeded key",
        publicKey: "pk-lf-1234567890",
        hashedSecretKey: expect.any(String),
        fastHashedSecretKey: expect.any(String),
        displaySecretKey: expect.any(String),
        createdAt: expect.any(String),
        lastUsedAt: null,
        expiresAt: null,
        isIngestionSuspended: expect.anything(),
        projectId: expect.any(String),
        orgId: orgId,
        plan: "cloud:hobby",
        scope: "PROJECT",
      });
    });

    it("ttl should be increased when reading from redis", async () => {
      await createAPIKey();

      // Mock prisma
      const mockPrisma = {
        apiKey: {
          findUnique: jest.fn(),
        },
      };

      // first auth will generate the fast hashed api key
      await new ApiAuthService(prisma, redis).verifyAuthHeaderAndReturnScope(
        validAuthHeader,
      );

      // second will add the key to redis
      await new ApiAuthService(prisma, redis).verifyAuthHeaderAndReturnScope(
        validAuthHeader,
      );

      // third will read from redis only
      await new ApiAuthService(
        mockPrisma as unknown as PrismaClient,
        redis,
      ).verifyAuthHeaderAndReturnScope(validAuthHeader);

      const apiKey = await prisma.apiKey.findUnique({
        where: { publicKey: seededApiKey.public },
      });
      expect(apiKey?.fastHashedSecretKey).toBeDefined();

      const ttl = await redis.ttl(`api-key:${apiKey?.fastHashedSecretKey}`);

      expect(ttl).toBeGreaterThan(env.LANGFUSE_CACHE_API_KEY_TTL_SECONDS - 2);

      // wait for 5 seconds
      await new Promise((resolve) => setTimeout(resolve, 5000));

      await new ApiAuthService(
        mockPrisma as unknown as PrismaClient,
        redis,
      ).verifyAuthHeaderAndReturnScope(validAuthHeader);

      const ttl2 = await redis.ttl(`api-key:${apiKey?.fastHashedSecretKey}`);

      expect(ttl2).toBeGreaterThan(env.LANGFUSE_CACHE_API_KEY_TTL_SECONDS - 2);
    }, 10000);

    it("should delete API keys from cache and db", async () => {
      await createAPIKey();

      // first auth will generate the fast hashed api key
      await new ApiAuthService(prisma, redis).verifyAuthHeaderAndReturnScope(
        validAuthHeader,
      );

      // second will add the key to redis
      const auth2 = await new ApiAuthService(
        prisma,
        redis,
      ).verifyAuthHeaderAndReturnScope(validAuthHeader);

      expect(auth2.validKey).toBe(true);

      const apiKey = await prisma.apiKey.findUnique({
        where: { publicKey: "pk-lf-1234567890" },
      });

      expect(apiKey).not.toBeNull();
      expect(apiKey?.fastHashedSecretKey).not.toBeNull();

      const cachedKey = await redis.get(
        `api-key:${apiKey?.fastHashedSecretKey}`,
      );
      expect(cachedKey).not.toBeNull();

      const parsed = OrgEnrichedApiKey.parse(JSON.parse(cachedKey!));

      expect(parsed).toEqual({
        ...apiKey,
        orgId: orgId,
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

      const deletedCachedKey = await redis.get(
        `api-key:${apiKey?.fastHashedSecretKey}`,
      );
      expect(deletedCachedKey).toBeNull();
    });
  });

  describe("invalidates api keys in redis", () => {
    const redis = createNewRedisInstance({
      maxRetriesPerRequest: null,
    });

    if (!redis) {
      throw new Error("Failed to initialize Redis for api-auth tests");
    }

    beforeEach(async () => {
      // if we do not remove the key, it will remain in the cache and
      // calling the test twice will not add the key to the cache

      const keys = await scanKeys(redis, "api-key*");
      if (keys.length > 0) {
        await safeMultiDel(redis, keys);
      }
    });

    afterEach(async () => {
      // if we do not remove the key, it will remain in the cache and
      // calling the test twice will not add the key to the cache

      const keys = await scanKeys(redis, "api-key*");
      if (keys.length > 0) {
        await safeMultiDel(redis, keys);
      }
    });

    afterAll(async () => {
      redis.disconnect();
    });

    it("should invalidate organization API keys in redis", async () => {
      await createAPIKey();

      // put keys into cache
      await new ApiAuthService(prisma, redis).verifyAuthHeaderAndReturnScope(
        validAuthHeader,
      );

      await new ApiAuthService(prisma, redis).verifyAuthHeaderAndReturnScope(
        validAuthHeader,
      );

      const apiKey = await prisma.apiKey.findUnique({
        where: { publicKey: "pk-lf-1234567890" },
      });
      expect(apiKey).not.toBeNull();

      const cachedKey = await redis.get(
        `api-key:${apiKey?.fastHashedSecretKey}`,
      );
      expect(cachedKey).not.toBeNull();

      await new ApiAuthService(prisma, redis).invalidateCachedOrgApiKeys(orgId);

      const invalidatedCachedKey = await redis.get(
        `api-key:${apiKey?.fastHashedSecretKey}`,
      );
      expect(invalidatedCachedKey).toBeNull();
    });

    it("if no keys in redis, invalidating org keys should do nothing", async () => {
      await createAPIKey();

      await prisma.apiKey.update({
        where: { publicKey: "pk-lf-1234567890" },
        data: {
          fastHashedSecretKey: Math.random().toString(36).substring(2, 15),
        },
      });

      await new ApiAuthService(prisma, redis).invalidateCachedOrgApiKeys(orgId);

      const keys = await scanKeys(redis, "api-key*");
      expect(keys.length).toBe(0);
    });

    it("if no keys in redis, invalidating org keys without fast hash should do nothing", async () => {
      await createAPIKey();

      await new ApiAuthService(prisma, redis).invalidateCachedOrgApiKeys(orgId);

      const keys = await scanKeys(redis, "api-key*");
      expect(keys.length).toBe(0);
    });

    it("should invalidate project API keys in redis", async () => {
      await createAPIKey();

      // put keys into cache
      await new ApiAuthService(prisma, redis).verifyAuthHeaderAndReturnScope(
        validAuthHeader,
      );
      await new ApiAuthService(prisma, redis).verifyAuthHeaderAndReturnScope(
        validAuthHeader,
      );

      const apiKey = await prisma.apiKey.findUnique({
        where: { publicKey: "pk-lf-1234567890" },
      });
      expect(apiKey).not.toBeNull();

      const cachedKey = await redis.get(
        `api-key:${apiKey?.fastHashedSecretKey}`,
      );
      expect(cachedKey).not.toBeNull();

      await new ApiAuthService(prisma, redis).invalidateCachedProjectApiKeys(
        projectId,
      );

      const invalidatedCachedKey = await redis.get(
        `api-key:${apiKey?.fastHashedSecretKey}`,
      );
      expect(invalidatedCachedKey).toBeNull();
    });

    it("if no keys in redis, invalidating project keys should do nothing", async () => {
      await createAPIKey();

      await prisma.apiKey.update({
        where: { publicKey: "pk-lf-1234567890" },
        data: {
          fastHashedSecretKey: Math.random().toString(36).substring(2, 15),
        },
      });

      await new ApiAuthService(prisma, redis).invalidateCachedProjectApiKeys(
        projectId,
      );

      const keys = await scanKeys(redis, "api-key*");
      expect(keys.length).toBe(0);
    });

    it("if no keys in redis, invalidating project keys without fast hash should do nothing", async () => {
      await createAPIKey();

      await prisma.apiKey.update({
        where: { publicKey: "pk-lf-1234567890" },
        data: {
          fastHashedSecretKey: Math.random().toString(36).substring(2, 15),
        },
      });

      await new ApiAuthService(prisma, redis).invalidateCachedProjectApiKeys(
        projectId,
      );

      const keys = await scanKeys(redis, "api-key*");
      expect(keys.length).toBe(0);
    });
  });

  const createAPIKey = async () => {
    const seedApiKey = {
      id: `seed-api-key-${projectId}`,
      secret: seededApiKey.secret,
      public: seededApiKey.public,
      note: "seeded key",
    };
    await prisma.apiKey.create({
      data: {
        note: seedApiKey.note,
        id: seedApiKey.id,
        publicKey: seedApiKey.public,
        hashedSecretKey: await hashSecretKey(seedApiKey.secret),
        displaySecretKey: getDisplaySecretKey(seedApiKey.secret),
        project: {
          connect: {
            id: projectId,
          },
        },
      },
    });
  };
});
