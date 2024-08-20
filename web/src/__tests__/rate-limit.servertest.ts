import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import { Redis } from "ioredis";

describe("RateLimitService", () => {
  const orgId = "seed-org-id";
  let redis: Redis;

  beforeAll(() => {
    redis = new Redis("redis://:myredissecret@127.0.0.1:6379", {
      maxRetriesPerRequest: null,
    });
  });

  afterAll(async () => {
    redis.disconnect();
  });

  beforeEach(async () => {
    expect(redis).toBeDefined();
    const keys = await redis?.keys("rate-limit*");
    if (keys && keys?.length > 0) {
      await redis?.del(keys);
    }
  });

  afterEach(async () => {
    const keys = await redis?.keys("rate-limit*");
    if (keys && keys.length > 0) {
      await redis?.del(keys);
    }
  });

  it("should create a new rate limit entry", async () => {
    const apiKey = {
      id: "test-api-key-id",
      note: "Test API Key",
      publicKey: "pk-test-1234567890",
      hashedSecretKey: "hashed-secret-key",
      fastHashedSecretKey: "fast-hashed-secret-key",
      displaySecretKey: "display-secret-key",
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: null,
      projectId: "test-project-id",
      orgId: orgId,
      plan: "default",
    };

    const rateLimitService = new RateLimitService(redis!);
    const result = await rateLimitService.rateLimitRequest(
      apiKey,
      "public-api",
    );

    expect(result).toEqual({
      apiKey: apiKey,
      resource: "public-api",
      points: 1000,
      remainingPoints: 999,
      msBeforeNext: expect.any(Number),
      consumedPoints: 1,
      isFirstInDuration: true,
    });
  });

  it("should increment the rate limit count", async () => {
    const apiKey = {
      id: "test-api-key-id",
      note: "Test API Key",
      publicKey: "pk-test-1234567890",
      hashedSecretKey: "hashed-secret-key",
      fastHashedSecretKey: "fast-hashed-secret-key",
      displaySecretKey: "display-secret-key",
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: null,
      projectId: "test-project-id",
      orgId: "test-org",
      plan: "default",
    };

    const rateLimitService = new RateLimitService(redis!);
    await rateLimitService.rateLimitRequest(apiKey, "public-api");

    const result = await rateLimitService.rateLimitRequest(
      apiKey,
      "public-api",
    );

    expect(result).toEqual({
      apiKey: apiKey,
      resource: "public-api",
      points: 1000,
      remainingPoints: 998,
      msBeforeNext: expect.any(Number),
      consumedPoints: 2,
      isFirstInDuration: false,
    });
  });

  it("should reset the rate limit count after the window expires", async () => {
    const apiKey = {
      id: "test-api-key-id",
      note: "Test API Key",
      publicKey: "pk-test-1234567890",
      hashedSecretKey: "hashed-secret-key",
      fastHashedSecretKey: "fast-hashed-secret-key",
      displaySecretKey: "display-secret-key",
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: null,
      projectId: "test-project-id",
      orgId: "test-org",
      plan: "default",
    };

    const customConfig = {
      default: [{ resource: "public-api" as const, points: 100, duration: 1 }],
      team: [],
    };

    const rateLimitService = new RateLimitService(redis!, customConfig);
    await rateLimitService.rateLimitRequest(apiKey, "public-api");

    const firstResult = await rateLimitService.rateLimitRequest(
      apiKey,
      "public-api",
    );

    expect(firstResult).toEqual({
      apiKey: apiKey,
      resource: "public-api",
      points: 100,
      remainingPoints: 98,
      msBeforeNext: expect.any(Number),
      consumedPoints: 2,
      isFirstInDuration: false,
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const secondResult = await rateLimitService.rateLimitRequest(
      apiKey,
      "public-api",
    );

    expect(secondResult).toEqual({
      apiKey: apiKey,
      resource: "public-api",
      points: 100,
      remainingPoints: 99,
      msBeforeNext: expect.any(Number),
      consumedPoints: 1,
      isFirstInDuration: true,
    });
  });

  it("should return false when rate limit is exceeded", async () => {
    const apiKey = {
      id: "test-id",
      note: null,
      publicKey: "test-public-key",
      hashedSecretKey: "test-hashed-secret-key",
      fastHashedSecretKey: null,
      displaySecretKey: "test-display-secret-key",
      createdAt: null,
      lastUsedAt: null,
      expiresAt: null,
      projectId: "test-project-id",
      orgId: "test-org",
      plan: "default",
    };
    const customConfig = {
      default: [{ resource: "public-api" as const, points: 100, duration: 1 }],
      team: [],
    };

    const rateLimitService = new RateLimitService(redis!, customConfig);

    for (let i = 0; i < 100; i++) {
      await rateLimitService.rateLimitRequest(apiKey, "public-api");
    }

    const result = await rateLimitService.rateLimitRequest(
      apiKey,
      "public-api",
    );

    expect(result).toEqual({
      apiKey: apiKey,
      resource: "public-api",
      points: 100,
      remainingPoints: 0,
      msBeforeNext: expect.any(Number),
      consumedPoints: 101,
      isFirstInDuration: false,
    });
  });

  it("should apply rate limits with override for specific resource", async () => {
    const apiKey = {
      id: "override-test-id",
      note: "Override Test API Key",
      publicKey: "pk-override-test-1234567890",
      hashedSecretKey: "hashed-secret-key",
      fastHashedSecretKey: "fast-hashed-secret-key",
      displaySecretKey: "display-secret-key",
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: null,
      projectId: "override-test-project-id",
      orgId: "override-test-org",
      plan: "default",
      rateLimits: [
        {
          resource: "public-api" as const,
          points: 5,
          duration: 10,
        },
      ],
    };

    const rateLimitService = new RateLimitService(redis!);

    const result = await rateLimitService.rateLimitRequest(
      apiKey,
      "public-api",
    );

    expect(result).toEqual({
      apiKey: apiKey,
      resource: "public-api",
      points: 5,
      remainingPoints: 4,
      msBeforeNext: expect.any(Number),
      consumedPoints: 1,
      isFirstInDuration: true,
    });
  });

  it("should not apply rate limits for resource prompts", async () => {
    const apiKey = {
      id: "no-rate-limit-test-id",
      note: "No Rate Limit Test API Key",
      publicKey: "pk-no-rate-limit-test-1234567890",
      hashedSecretKey: "hashed-secret-key",
      fastHashedSecretKey: "fast-hashed-secret-key",
      displaySecretKey: "display-secret-key",
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: null,
      projectId: "no-rate-limit-test-project-id",
      orgId: "no-rate-limit-test-org",
      plan: "default",
      rateLimits: [],
    };

    const rateLimitService = new RateLimitService(redis!);

    const result = await rateLimitService.rateLimitRequest(apiKey, "prompts");

    expect(result).toBeUndefined();
  });

  it("should not apply rate limits for ingestion when overridden to null in API key", async () => {
    const apiKey = {
      id: "override-no-rate-limit-test-id",
      note: "Override No Rate Limit Test API Key",
      publicKey: "pk-override-no-rate-limit-test-1234567890",
      hashedSecretKey: "hashed-secret-key",
      fastHashedSecretKey: "fast-hashed-secret-key",
      displaySecretKey: "display-secret-key",
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: null,
      projectId: "override-no-rate-limit-test-project-id",
      orgId: "override-no-rate-limit-test-org",
      plan: "default",
      rateLimits: [
        {
          resource: "ingestion" as const,
        },
      ],
    };

    const rateLimitService = new RateLimitService(redis!);

    const result = await rateLimitService.rateLimitRequest(apiKey, "ingestion");

    expect(result).toBeUndefined();
  });
});
