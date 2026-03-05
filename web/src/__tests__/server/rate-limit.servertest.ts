import {
  createHttpHeaderFromRateLimit,
  RateLimitService,
} from "@/src/features/public-api/server/RateLimitService";
import {
  clearRedisKeysByPatternSafely,
  createRedisTestClient,
  ensureRedisReady,
  type RedisTestClient,
} from "@/src/__tests__/server/redis-test-utils";

describe("RateLimitService", () => {
  const orgId = "seed-org-id";
  let redis: RedisTestClient;

  const createRedisClient = (): RedisTestClient => {
    return createRedisTestClient({
      maxRetriesPerRequest: null,
      enableAutoPipelining: false, // Align with our settings overwrite for rate limit service
    });
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
    await clearRedisKeysByPatternSafely(redis, "rate-limit*");
  }, 20_000);

  afterEach(async () => {
    await clearRedisKeysByPatternSafely(redis, "rate-limit*");
  }, 20_000);

  afterAll(async () => {
    await clearRedisKeysByPatternSafely(redis, "rate-limit*");
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
