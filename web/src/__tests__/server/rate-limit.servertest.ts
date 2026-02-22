import {
  createHttpHeaderFromRateLimit,
  RateLimitService,
} from "@/src/features/public-api/server/RateLimitService";
import {
  createNewRedisInstance,
  safeMultiDel,
  scanKeys,
} from "@langfuse/shared/src/server";

describe("RateLimitService", () => {
  type RedisClient = NonNullable<ReturnType<typeof createNewRedisInstance>>;
  const orgId = "seed-org-id";
  let redis: RedisClient;

  const createRedisClient = (): RedisClient => {
    const client = createNewRedisInstance({
      maxRetriesPerRequest: null,
      enableAutoPipelining: false, // Align with our settings overwrite for rate limit service
    });

    if (!client) {
      throw new Error("Failed to initialize Redis client for tests.");
    }

    return client;
  };

  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const isConnectionClosedError = (error: unknown): boolean =>
    error instanceof Error && error.message.includes("Connection is closed");

  const ensureRedisReady = async (redisClient: RedisClient): Promise<void> => {
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        await redisClient.ping();
        return;
      } catch (error) {
        lastError = error;
        if (isConnectionClosedError(error)) {
          try {
            await redisClient.connect();
          } catch {
            // Ignore reconnect errors and retry ping.
          }
        }
        await sleep(250);
      }
    }

    throw lastError ?? new Error("Redis client not ready");
  };

  const getRateLimitKeys = async (redisClient: RedisClient) => {
    return await scanKeys(redisClient, "rate-limit*");
  };

  const clearRateLimitKeys = async (redisClient: RedisClient) => {
    const keys = await getRateLimitKeys(redisClient);
    if (keys.length > 0) {
      await safeMultiDel(redisClient, keys);
    }
  };

  const clearRateLimitKeysSafely = async (redisClient: RedisClient) => {
    try {
      await clearRateLimitKeys(redisClient);
    } catch (error) {
      if (!isConnectionClosedError(error)) {
        throw error;
      }
    }
  };

  beforeAll(async () => {
    RateLimitService.shutdown();
    redis = createRedisClient();
    await ensureRedisReady(redis);
  }, 20_000);

  beforeEach(async () => {
    if (redis.status === "close" || redis.status === "end") {
      RateLimitService.shutdown();
      redis = createRedisClient();
    }
    await ensureRedisReady(redis);
    await clearRateLimitKeysSafely(redis);
  }, 20_000);

  afterEach(async () => {
    await clearRateLimitKeysSafely(redis);
  }, 20_000);

  afterAll(async () => {
    await clearRateLimitKeysSafely(redis);
    redis.disconnect();
    RateLimitService.shutdown();
  }, 20_000);

  it("should create correct ratelimit headers", () => {
    const rateLimitRes = {
      points: 1000,
      remainingPoints: 999,
      msBeforeNext: 1000,
      resource: "public-api" as const,
      scope: {
        orgId: orgId,
        plan: "cloud:hobby" as const,
        projectId: "test-project-id",
        accessLevel: "project" as const,
        rateLimitOverrides: [],
      },
      consumedPoints: 1,
      isFirstInDuration: true,
    };

    const headers = createHttpHeaderFromRateLimit(rateLimitRes);

    expect(headers).toEqual({
      "Retry-After": 1,
      "X-RateLimit-Limit": 1000,
      "X-RateLimit-Remaining": 999,
      "X-RateLimit-Reset": expect.any(String),
    });
  });

  it("should rate limit", async () => {
    const scope = {
      orgId: orgId,
      plan: "cloud:hobby" as const,
      projectId: "test-project-id",
      accessLevel: "project" as const,
      rateLimitOverrides: [],
    };

    expect(redis).toBeDefined();

    const rateLimitService = RateLimitService.getInstance(redis);
    const result = await rateLimitService.rateLimitRequest(scope, "public-api");

    expect(result?.res).toEqual({
      scope: scope,
      resource: "public-api",
      points: 30,
      remainingPoints: 29,
      msBeforeNext: expect.any(Number),
      consumedPoints: 1,
      isFirstInDuration: true,
    });

    expect(result?.isRateLimited()).toBe(false);

    // check redis for the rate limit key
    const value = await redis.get("rate-limit:public-api:seed-org-id");

    expect(value).toBeDefined();
    expect(parseInt(value ?? "0")).toBeGreaterThan(0);
  });

  it("should increment the rate limit count", async () => {
    const scope = {
      orgId: orgId,
      plan: "cloud:hobby" as const,
      projectId: "test-project-id",
      accessLevel: "project" as const,
      rateLimitOverrides: [],
    };

    const rateLimitService = RateLimitService.getInstance(redis);
    await rateLimitService.rateLimitRequest(scope, "public-api");

    const result = await rateLimitService.rateLimitRequest(scope, "public-api");

    expect(result?.res).toEqual({
      scope: scope,
      resource: "public-api",
      points: 30,
      remainingPoints: 28,
      msBeforeNext: expect.any(Number),
      consumedPoints: 2,
      isFirstInDuration: false,
    });
    expect(result?.isRateLimited()).toBe(false);
  });

  it("should reset the rate limit count after the window expires", async () => {
    const scope = {
      orgId: orgId,
      plan: "cloud:hobby" as const,
      projectId: "test-project-id",
      accessLevel: "project" as const,
      rateLimitOverrides: [
        { resource: "public-api" as const, points: 100, durationInSec: 2 },
      ],
    };

    const rateLimitService = RateLimitService.getInstance(redis);
    await rateLimitService.rateLimitRequest(scope, "public-api");

    const firstResult = await rateLimitService.rateLimitRequest(
      scope,
      "public-api",
    );
    expect(firstResult?.isRateLimited()).toBe(false);

    expect(firstResult?.res).toEqual({
      scope: scope,
      resource: "public-api",
      points: 100,
      remainingPoints: 98,
      msBeforeNext: expect.any(Number),
      consumedPoints: 2,
      isFirstInDuration: false,
    });

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const secondResult = await rateLimitService.rateLimitRequest(
      scope,
      "public-api",
    );

    expect(secondResult?.res).toEqual({
      scope: scope,
      resource: "public-api",
      points: 100,
      remainingPoints: 99,
      msBeforeNext: expect.any(Number),
      consumedPoints: 1,
      isFirstInDuration: true,
    });

    expect(secondResult?.isRateLimited()).toBe(false);
  });

  it("should return false when rate limit is exceeded", async () => {
    const scope = {
      orgId: orgId,
      plan: "cloud:hobby" as const,
      projectId: "test-project-id",
      accessLevel: "project" as const,
      rateLimitOverrides: [
        { resource: "public-api" as const, points: 5, durationInSec: 60 },
      ],
    };

    const rateLimitService = RateLimitService.getInstance(redis);

    for (let i = 0; i < 5; i++) {
      await rateLimitService.rateLimitRequest(scope, "public-api");
    }

    const result = await rateLimitService.rateLimitRequest(scope, "public-api");

    expect(result?.res).toEqual({
      scope: scope,
      resource: "public-api",
      points: 5,
      remainingPoints: 0,
      msBeforeNext: expect.any(Number),
      consumedPoints: 6,
      isFirstInDuration: false,
    });
    expect(result?.isRateLimited()).toBe(true);
  });

  it("should apply rate limits with override for specific resource", async () => {
    const scope = {
      orgId: orgId,
      plan: "cloud:hobby" as const,
      projectId: "test-project-id",
      accessLevel: "project" as const,
      rateLimitOverrides: [
        { resource: "public-api" as const, points: 5, durationInSec: 10 },
      ],
    };

    const rateLimitService = RateLimitService.getInstance(redis);

    const result = await rateLimitService.rateLimitRequest(scope, "public-api");

    expect(result?.res).toEqual({
      scope: scope,
      resource: "public-api",
      points: 5,
      remainingPoints: 4,
      msBeforeNext: expect.any(Number),
      consumedPoints: 1,
      isFirstInDuration: true,
    });
  });

  it("should not apply rate limits for resource prompts", async () => {
    const scope = {
      orgId: orgId,
      plan: "cloud:hobby" as const,
      projectId: "test-project-id",
      accessLevel: "project" as const,
      rateLimitOverrides: [
        { resource: "public-api" as const, points: 5, durationInSec: 10 },
      ],
    };

    const rateLimitService = RateLimitService.getInstance(redis);

    const result = await rateLimitService.rateLimitRequest(scope, "prompts");

    expect(result?.res).toBeUndefined();
    expect(result?.isRateLimited()).toBe(false);
  });

  it("should not apply rate limits for ingestion when overridden to null in API key", async () => {
    const scope = {
      orgId: orgId,
      plan: "cloud:hobby" as const,
      projectId: "test-project-id",
      accessLevel: "project" as const,
      rateLimitOverrides: [
        { resource: "ingestion" as const, points: null, durationInSec: null },
      ],
    };

    const rateLimitService = RateLimitService.getInstance(redis);

    const result = await rateLimitService.rateLimitRequest(scope, "ingestion");

    expect(result?.res).toBeUndefined();
  });

  // Not applicable now that the RateLimitService instantiates its own Redis
  // it("should not apply rate limits when redis is not defined", async () => {
  //   const scope = {
  //     orgId: orgId,
  //     plan: "cloud:hobby" as const,
  //     projectId: "test-project-id",
  //     accessLevel: "project" as const,
  //     rateLimitOverrides: [
  //       { resource: "public-api" as const, points: 5, durationInSec: 10 },
  //     ],
  //   };
  //
  //   const rateLimitService = new RateLimitService(null);
  //
  //   const result = await rateLimitService.rateLimitRequest(scope, "public-api");
  //
  //   expect(result?.res).toBeUndefined();
  //   expect(result?.isRateLimited()).toBe(false);
  // });

  it("should not apply rate limits for OSS plan", async () => {
    const scope = {
      orgId: orgId,
      plan: "oss" as const,
      projectId: "test-project-id",
      accessLevel: "project" as const,
      rateLimitOverrides: [],
    };

    const rateLimitService = RateLimitService.getInstance(redis);

    const result = await rateLimitService.rateLimitRequest(scope, "public-api");

    expect(result?.res).toBeUndefined();
    expect(result?.isRateLimited()).toBe(false);
  });
});
