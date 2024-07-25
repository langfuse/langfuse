import {
  getDisplaySecretKey,
  hashSecretKey,
} from "@langfuse/shared/src/server";
import {
  ApiAuthService,
  ApiKeyZod,
} from "@/src/features/public-api/server/apiAuth";
import { prisma } from "@langfuse/shared/src/db";
import { Redis } from "ioredis";
import { after } from "lodash";

describe("Authenticate API calls", () => {
  beforeEach(async () => {
    await prisma.score.deleteMany();
    await prisma.observation.deleteMany();
    await prisma.trace.deleteMany();
    await prisma.apiKey.deleteMany();
  });

  // describe("validates without redis", () => {
  //   it("should create new api key", async () => {
  //     await createAPIKey();
  //     const auth = await new ApiAuthService(
  //       prisma,
  //       null,
  //     ).verifyAuthHeaderAndReturnScope(
  //       "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkw",
  //     );

  //     expect(auth.validKey).toBe(true);

  //     const apiKey = await prisma.apiKey.findUnique({
  //       where: { publicKey: "pk-lf-1234567890" },
  //     });
  //     expect(apiKey).not.toBeNull();
  //     expect(apiKey?.fastHashedSecretKey).not.toBeNull();
  //   });

  //   it("should create new api key and succeed with new key", async () => {
  //     await createAPIKey();
  //     const auth = await new ApiAuthService(
  //       prisma,
  //       null,
  //     ).verifyAuthHeaderAndReturnScope(
  //       "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkw",
  //     );
  //     expect(auth.validKey).toBe(true);

  //     const apiKey = await prisma.apiKey.findUnique({
  //       where: { publicKey: "pk-lf-1234567890" },
  //     });
  //     expect(apiKey).not.toBeNull();
  //     expect(apiKey?.fastHashedSecretKey).not.toBeNull();

  //     const auth2 = await new ApiAuthService(
  //       prisma,
  //       redis,
  //     ).verifyAuthHeaderAndReturnScope(
  //       "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkw",
  //     );
  //     expect(auth2.validKey).toBe(true);
  //   });

  //   it("should fail on wrong api key with new key", async () => {
  //     await createAPIKey();
  //     const auth = await new ApiAuthService(
  //       prisma,
  //       null,
  //     ).verifyAuthHeaderAndReturnScope(
  //       "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkw",
  //     );
  //     expect(auth.validKey).toBe(true);

  //     const apiKey = await prisma.apiKey.findUnique({
  //       where: { publicKey: "pk-lf-1234567890" },
  //     });
  //     console.log(apiKey);
  //     expect(apiKey).not.toBeNull();
  //     expect(apiKey?.fastHashedSecretKey).not.toBeNull();

  //     const wrongAuth = await new ApiAuthService(
  //       prisma,
  //       redis,
  //     ).verifyAuthHeaderAndReturnScope(
  //       "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkx",
  //     );
  //     expect(wrongAuth.validKey).toBe(false);
  //   });

  //   it("should fail on wrong api key without new key", async () => {
  //     await createAPIKey();
  //     const initialApiKey = await prisma.apiKey.findUnique({
  //       where: { publicKey: "pk-lf-1234567890" },
  //     });
  //     expect(initialApiKey).not.toBeNull();
  //     expect(initialApiKey?.fastHashedSecretKey).toBeNull();

  //     const auth = await new ApiAuthService(
  //       prisma,
  //       null,
  //     ).verifyAuthHeaderAndReturnScope(
  //       "Basic cGstbGYtMTIzNDU2Nzg5MDpzay1sZi0xMjM0NTY3ODkx",
  //     );
  //     expect(auth.validKey).toBe(false);

  //     const apiKey = await prisma.apiKey.findUnique({
  //       where: { publicKey: "pk-lf-1234567890" },
  //     });
  //     expect(apiKey).not.toBeNull();
  //     expect(apiKey?.fastHashedSecretKey).toBeNull();
  //   });
  // });

  describe("validates with redis", () => {
    const redis = new Redis("redis://:myredissecret@127.0.0.1:6379", {
      maxRetriesPerRequest: null,
    });

    afterEach(async () => {
      // if I do not remove the key, it will remain in the cache and
      // calling the test twice will not add the key to the cache
      redis.del(
        "api-key:ed6818ada09bdad405a74ac72773dde1708dd3fc6fe8bb81b59927400419d227",
      );
    });

    afterAll(async () => {
      redis.disconnect();
    });

    it("should create new api key and read from cache", async () => {
      await createAPIKey();

      // first auth will generate the fast hashed api key
      const auth = await new ApiAuthService(
        prisma,
        redis,
      ).verifyAuthHeaderAndReturnScope(
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
      console.log("api key from db: ", apiKey);

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
    });

    it("should delete API keys from cache and db", async () => {
      await createAPIKey();

      // first auth will generate the fast hashed api key
      const auth = await new ApiAuthService(
        prisma,
        redis,
      ).verifyAuthHeaderAndReturnScope(
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
      console.log("api key from db: ", apiKey);

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
