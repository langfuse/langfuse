import {
  getDisplaySecretKey,
  hashSecretKey,
} from "@langfuse/shared/src/server";
import {
  ApiAuthService,
  ApiKeyZod,
} from "@/src/features/public-api/server/apiAuth";
import { type PrismaClient, prisma } from "@langfuse/shared/src/db";
import { Redis } from "ioredis";
import { env } from "@/src/env.mjs";

describe("Authenticate API calls", () => {
  beforeEach(async () => {
    await prisma.score.deleteMany();
    await prisma.observation.deleteMany();
    await prisma.trace.deleteMany();
    await prisma.apiKey.deleteMany();
  });
  afterEach(async () => {
    await prisma.score.deleteMany();
    await prisma.observation.deleteMany();
    await prisma.trace.deleteMany();
    await prisma.apiKey.deleteMany();
  });

  describe("validates without redis", () => {
    it("should create new api key", async () => {
      await createAPIKey();
      const auth = await new ApiAuthService(
        prisma,
        null,
      ).verifyAuthHeaderAndReturnScope(
        "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkw",
      );

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
      ).verifyAuthHeaderAndReturnScope(
        "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkw",
      );
      expect(auth.validKey).toBe(true);

      const apiKey = await prisma.apiKey.findUnique({
        where: { publicKey: "pk-lf-1234567890" },
      });
      expect(apiKey).not.toBeNull();
      expect(apiKey?.fastHashedSecretKey).not.toBeNull();

      const auth2 = await new ApiAuthService(
        prisma,
        null,
      ).verifyAuthHeaderAndReturnScope(
        "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkw",
      );
      expect(auth2.validKey).toBe(true);
    });

    it("should fail on wrong api key with new key", async () => {
      await createAPIKey();
      const auth = await new ApiAuthService(
        prisma,
        null,
      ).verifyAuthHeaderAndReturnScope(
        "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkw",
      );
      expect(auth.validKey).toBe(true);

      const apiKey = await prisma.apiKey.findUnique({
        where: { publicKey: "pk-lf-1234567890" },
      });

      expect(apiKey).not.toBeNull();
      expect(apiKey?.fastHashedSecretKey).not.toBeNull();

      const wrongAuth = await new ApiAuthService(
        prisma,
        null,
      ).verifyAuthHeaderAndReturnScope(
        "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkx",
      );
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
      ).verifyAuthHeaderAndReturnScope(
        "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkx",
      );
      expect(auth.validKey).toBe(false);

      const apiKey = await prisma.apiKey.findUnique({
        where: { publicKey: "pk-lf-1234567890" },
      });
      expect(apiKey).not.toBeNull();
      expect(apiKey?.fastHashedSecretKey).toBeNull();
    });
  });

  describe("validates with redis", () => {
    const redis = new Redis("redis://:myredissecret@127.0.0.1:6379", {
      maxRetriesPerRequest: null,
    });

    beforeEach(async () => {
      // if we do not remove the key, it will remain in the cache and
      // calling the test twice will not add the key to the cache

      const keys = await redis.keys("api-key*");
      if (keys.length > 0) {
        await redis.del(keys);
      }
    });

    afterEach(async () => {
      // if we do not remove the key, it will remain in the cache and
      // calling the test twice will not add the key to the cache
      const keys = await redis.keys("api-key*");
      if (keys.length > 0) {
        await redis.del(keys);
      }
    });

    afterAll(async () => {
      redis.disconnect();
    });

    it("should create new api key and read from cache", async () => {
      await createAPIKey();

      // first auth will generate the fast hashed api key
      await new ApiAuthService(prisma, redis).verifyAuthHeaderAndReturnScope(
        "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkw",
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
        "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkw",
      );

      const cachedKey2 = await redis.get(
        `api-key:${apiKey?.fastHashedSecretKey}`,
      );

      expect(cachedKey2).not.toBeNull();

      const parsed = ApiKeyZod.parse(JSON.parse(cachedKey2!));

      expect(parsed).toEqual({
        ...apiKey,
        createdAt: apiKey?.createdAt.toISOString(),
      });
    });

    it("searching for non-existing key stores flag in redis and fails auth", async () => {
      // key does not exist in database

      const verification = await new ApiAuthService(
        prisma,
        redis,
      ).verifyAuthHeaderAndReturnScope(
        "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkw",
      );

      expect(verification.validKey).toBe(false);

      const redisKeys = await redis.keys(`api-key:*`);
      expect(redisKeys.length).toBe(1);
      const redisValue = await redis.get(redisKeys[0]);
      expect(redisValue).toBe('"api-key-non-existent"');
    });

    it("searching for non-existing key again fails auth", async () => {
      // key does not exist in database

      const verification = await new ApiAuthService(
        prisma,
        redis,
      ).verifyAuthHeaderAndReturnScope(
        "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkw",
      );

      expect(verification.validKey).toBe(false);

      const redisKeys = await redis.keys(`api-key:*`);
      expect(redisKeys.length).toBe(1);
      const redisValue = await redis.get(redisKeys[0]);
      expect(redisValue).toBe('"api-key-non-existent"');

      const verification2 = await new ApiAuthService(
        prisma,
        redis,
      ).verifyAuthHeaderAndReturnScope(
        "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkw",
      );
      expect(verification2.validKey).toBe(false);

      const redisKeys2 = await redis.keys(`api-key:*`);
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
        "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkw",
      );

      // second will add the key to redis
      const auth2 = await new ApiAuthService(
        prisma,
        redis,
      ).verifyAuthHeaderAndReturnScope(
        "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkw",
      );

      // third will read from redis only
      await new ApiAuthService(
        mockPrisma as unknown as PrismaClient,
        redis,
      ).verifyAuthHeaderAndReturnScope(
        "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkw",
      );

      expect(auth2.validKey).toBe(true);

      // Ensure prisma was not called
      expect(mockPrisma.apiKey.findUnique).not.toHaveBeenCalled();

      const cachedKey = await redis.get(
        "api-key:ed6818ada09bdad405a74ac72773dde1708dd3fc6fe8bb81b59927400419d227",
      );
      expect(cachedKey).not.toBeNull();

      const parsed = ApiKeyZod.parse(JSON.parse(cachedKey!));

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
        projectId: expect.any(String),
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
        "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkw",
      );

      // second will add the key to redis
      await new ApiAuthService(prisma, redis).verifyAuthHeaderAndReturnScope(
        "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkw",
      );

      // third will read from redis only
      await new ApiAuthService(
        mockPrisma as unknown as PrismaClient,
        redis,
      ).verifyAuthHeaderAndReturnScope(
        "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkw",
      );

      const ttl = await redis.ttl(
        "api-key:ed6818ada09bdad405a74ac72773dde1708dd3fc6fe8bb81b59927400419d227",
      );

      expect(ttl).toBeGreaterThan(env.LANGFUSE_CACHE_API_KEY_TTL_SECONDS - 2);

      // wait for 5 seconds
      await new Promise((resolve) => setTimeout(resolve, 5000));

      await new ApiAuthService(
        mockPrisma as unknown as PrismaClient,
        redis,
      ).verifyAuthHeaderAndReturnScope(
        "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkw",
      );

      const ttl2 = await redis.ttl(
        "api-key:ed6818ada09bdad405a74ac72773dde1708dd3fc6fe8bb81b59927400419d227",
      );

      expect(ttl2).toBeGreaterThan(env.LANGFUSE_CACHE_API_KEY_TTL_SECONDS - 2);
    }, 10000);

    it("should delete API keys from cache and db", async () => {
      await createAPIKey();

      // first auth will generate the fast hashed api key
      await new ApiAuthService(prisma, redis).verifyAuthHeaderAndReturnScope(
        "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkw",
      );

      // second will add the key to redis
      const auth2 = await new ApiAuthService(
        prisma,
        redis,
      ).verifyAuthHeaderAndReturnScope(
        "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkw",
      );

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

      const parsed = ApiKeyZod.parse(JSON.parse(cachedKey!));

      expect(parsed).toEqual({
        ...apiKey,
        createdAt: apiKey?.createdAt.toISOString(),
      });

      await new ApiAuthService(prisma, redis).deleteApiKey(
        apiKey?.id!,
        apiKey?.projectId!,
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

  const createAPIKey = async () => {
    const seedApiKey = {
      id: "seed-api-key",
      secret: "sk-lf-1234567890",
      public: "pk-lf-1234567890",
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
            id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          },
        },
      },
    });
  };

  afterAll(async () => {
    await prisma.apiKey.deleteMany();
    await createAPIKey();
  });
});
