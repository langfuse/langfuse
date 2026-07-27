import {
  createHttpHeaderFromRateLimit,
  RATE_LIMIT_REDIS_KEY_PREFIX,
  RateLimitService,
} from "@/src/features/public-api/server/RateLimitService";
import { randomUUID } from "crypto";
import type { Redis } from "ioredis";
import type { ApiAccessScope } from "@langfuse/shared/src/server";
import {
  clearRedisKeysByPatternSafely,
  createRedisTestClient,
  ensureRedisReady,
  type RedisTestClient,
} from "@/src/__tests__/server/redis-test-utils";

// The rate limiter only reads these scope fields; the cast keeps the test
// fixtures minimal without changing them at runtime.
type TestApiAccessScope = Pick<
  ApiAccessScope,
  "orgId" | "plan" | "projectId" | "accessLevel" | "rateLimitOverrides"
>;

const asScope = (scope: TestApiAccessScope): ApiAccessScope =>
  scope as ApiAccessScope;

describe("RateLimitService", () => {
  const orgId = `rate-limit-test-org-${randomUUID()}`;
  const projectId = `rate-limit-test-project-${randomUUID()}`;
  const rateLimitKeysPattern = `${RATE_LIMIT_REDIS_KEY_PREFIX}:*:${orgId}`;
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
    await clearRedisKeysByPatternSafely(redis, rateLimitKeysPattern);
  }, 20_000);

  afterEach(async () => {
    await clearRedisKeysByPatternSafely(redis, rateLimitKeysPattern);
  }, 20_000);

  afterAll(async () => {
    await clearRedisKeysByPatternSafely(redis, rateLimitKeysPattern);
    redis.disconnect();
    RateLimitService.shutdown();
  }, 20_000);

  it("should create correct ratelimit headers", () => {
    const rateLimitRes = {
      points: 1000,
      remainingPoints: 999,
      msBeforeNext: 1000,
      resource: "public-api" as const,
      scope: asScope({
        orgId: orgId,
        plan: "cloud:hobby" as const,
        projectId,
        accessLevel: "project" as const,
        rateLimitOverrides: [],
      }),
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
      projectId,
      accessLevel: "project" as const,
      rateLimitOverrides: [],
    };

    expect(redis).toBeDefined();

    const rateLimitService = RateLimitService.getInstance(redis as Redis);
    const result = await rateLimitService.rateLimitRequest(
      asScope(scope),
      "public-api",
    );

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
    const value = await redis.get(
      `${RATE_LIMIT_REDIS_KEY_PREFIX}:public-api:${orgId}`,
    );

    expect(value).toBeDefined();
    expect(parseInt(value ?? "0")).toBeGreaterThan(0);
  });

  it("should increment the rate limit count", async () => {
    const scope = {
      orgId: orgId,
      plan: "cloud:hobby" as const,
      projectId,
      accessLevel: "project" as const,
      rateLimitOverrides: [],
    };

    const rateLimitService = RateLimitService.getInstance(redis as Redis);
    await rateLimitService.rateLimitRequest(asScope(scope), "public-api");

    const result = await rateLimitService.rateLimitRequest(
      asScope(scope),
      "public-api",
    );

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
      projectId,
      accessLevel: "project" as const,
      rateLimitOverrides: [
        { resource: "public-api" as const, points: 100, durationInSec: 2 },
      ],
    };

    const rateLimitService = RateLimitService.getInstance(redis as Redis);
    await rateLimitService.rateLimitRequest(asScope(scope), "public-api");

    const firstResult = await rateLimitService.rateLimitRequest(
      asScope(scope),
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

    await redis.del(`${RATE_LIMIT_REDIS_KEY_PREFIX}:public-api:${orgId}`);

    const secondResult = await rateLimitService.rateLimitRequest(
      asScope(scope),
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
      projectId,
      accessLevel: "project" as const,
      rateLimitOverrides: [
        { resource: "public-api" as const, points: 5, durationInSec: 60 },
      ],
    };

    const rateLimitService = RateLimitService.getInstance(redis as Redis);

    for (let i = 0; i < 5; i++) {
      await rateLimitService.rateLimitRequest(asScope(scope), "public-api");
    }

    const result = await rateLimitService.rateLimitRequest(
      asScope(scope),
      "public-api",
    );

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
      projectId,
      accessLevel: "project" as const,
      rateLimitOverrides: [
        { resource: "public-api" as const, points: 5, durationInSec: 10 },
      ],
    };

    const rateLimitService = RateLimitService.getInstance(redis as Redis);

    const result = await rateLimitService.rateLimitRequest(
      asScope(scope),
      "public-api",
    );

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
      projectId,
      accessLevel: "project" as const,
      rateLimitOverrides: [
        { resource: "public-api" as const, points: 5, durationInSec: 10 },
      ],
    };

    const rateLimitService = RateLimitService.getInstance(redis as Redis);

    const result = await rateLimitService.rateLimitRequest(
      asScope(scope),
      "prompts",
    );

    expect(result?.res).toBeUndefined();
    expect(result?.isRateLimited()).toBe(false);
  });

  it("should not apply rate limits for ingestion when overridden to null in API key", async () => {
    const scope = {
      orgId: orgId,
      plan: "cloud:hobby" as const,
      projectId,
      accessLevel: "project" as const,
      rateLimitOverrides: [
        { resource: "ingestion" as const, points: null, durationInSec: null },
      ],
    };

    const rateLimitService = RateLimitService.getInstance(redis as Redis);

    const result = await rateLimitService.rateLimitRequest(
      asScope(scope),
      "ingestion",
    );

    expect(result?.res).toBeUndefined();
  });

  // Not applicable now that the RateLimitService instantiates its own Redis
  // it("should not apply rate limits when redis is not defined", async () => {
  //   const scope = {
  //     orgId: orgId,
  //     plan: "cloud:hobby" as const,
  //     projectId,
  //     accessLevel: "project" as const,
  //     rateLimitOverrides: [
  //       { resource: "public-api" as const, points: 5, durationInSec: 10 },
  //     ],
  //   };
  //
  //   const rateLimitService = new RateLimitService(null);
  //
  //   const result = await rateLimitService.rateLimitRequest(asScope(scope), "public-api");
  //
  //   expect(result?.res).toBeUndefined();
  //   expect(result?.isRateLimited()).toBe(false);
  // });

  it("should not apply rate limits for OSS plan", async () => {
    const scope = {
      orgId: orgId,
      plan: "oss" as const,
      projectId,
      accessLevel: "project" as const,
      rateLimitOverrides: [],
    };

    const rateLimitService = RateLimitService.getInstance(redis as Redis);

    const result = await rateLimitService.rateLimitRequest(
      asScope(scope),
      "public-api",
    );

    expect(result?.res).toBeUndefined();
    expect(result?.isRateLimited()).toBe(false);
  });

  it("should apply score-delete rate limits for hobby plan", async () => {
    const scope = {
      orgId: orgId,
      plan: "cloud:hobby" as const,
      projectId,
      accessLevel: "project" as const,
      rateLimitOverrides: [],
    };

    const rateLimitService = RateLimitService.getInstance(redis as Redis);
    const result = await rateLimitService.rateLimitRequest(
      asScope(scope),
      "score-delete",
    );

    expect(result?.res).toEqual({
      scope: scope,
      resource: "score-delete",
      points: 50,
      remainingPoints: 49,
      msBeforeNext: expect.any(Number),
      consumedPoints: 1,
      isFirstInDuration: true,
    });
    expect(result?.isRateLimited()).toBe(false);
  });

  it("should apply public-api-legacy rate limits by cloud plan", async () => {
    const cases = [
      { plan: "cloud:hobby" as const, points: 15 },
      { plan: "cloud:core" as const, points: 30 },
      { plan: "cloud:pro" as const, points: 100 },
      { plan: "cloud:team" as const, points: 100 },
      { plan: "cloud:enterprise" as const, points: 100 },
    ];

    const rateLimitService = RateLimitService.getInstance(redis as Redis);

    for (const testCase of cases) {
      await redis.del(
        `${RATE_LIMIT_REDIS_KEY_PREFIX}:public-api-legacy:${orgId}`,
      );

      const scope = {
        orgId: orgId,
        plan: testCase.plan,
        projectId,
        accessLevel: "project" as const,
        rateLimitOverrides: [],
      };

      const result = await rateLimitService.rateLimitRequest(
        asScope(scope),
        "public-api-legacy",
      );

      expect(result?.res).toEqual({
        scope: scope,
        resource: "public-api-legacy",
        points: testCase.points,
        remainingPoints: testCase.points - 1,
        msBeforeNext: expect.any(Number),
        consumedPoints: 1,
        isFirstInDuration: true,
      });
      expect(result?.isRateLimited()).toBe(false);
    }
  });

  it("should apply public-api-v2-metrics rate limits by cloud plan", async () => {
    const cases = [
      { plan: "cloud:hobby" as const, points: 100, durationInSec: 86400 },
      { plan: "cloud:core" as const, points: 100, durationInSec: 3600 },
      { plan: "cloud:pro" as const, points: 500, durationInSec: 3600 },
      { plan: "cloud:team" as const, points: 500, durationInSec: 3600 },
      { plan: "cloud:enterprise" as const, points: 500, durationInSec: 3600 },
    ];

    const rateLimitService = RateLimitService.getInstance(redis as Redis);

    for (const testCase of cases) {
      const activeKey = `${RATE_LIMIT_REDIS_KEY_PREFIX}:public-api-v2-metrics:${orgId}`;

      await redis.del(activeKey);

      const scope = {
        orgId: orgId,
        plan: testCase.plan,
        projectId,
        accessLevel: "project" as const,
        rateLimitOverrides: [],
      };

      const result = await rateLimitService.rateLimitRequest(
        asScope(scope),
        "public-api-v2-metrics",
      );

      expect(result?.res).toEqual({
        scope: scope,
        resource: "public-api-v2-metrics",
        points: testCase.points,
        remainingPoints: testCase.points - 1,
        msBeforeNext: expect.any(Number),
        consumedPoints: 1,
        isFirstInDuration: true,
      });
      expect(result?.isRateLimited()).toBe(false);

      const ttlInSec = await redis.ttl(activeKey);

      expect(ttlInSec).toBeGreaterThan(0);
      expect(ttlInSec).toBeLessThanOrEqual(testCase.durationInSec);
      expect(ttlInSec).toBeGreaterThan(testCase.durationInSec - 60);
    }
  });

  it("should apply media-upload rate limits separately from ingestion", async () => {
    const scope = {
      orgId: orgId,
      plan: "cloud:hobby" as const,
      projectId,
      accessLevel: "project" as const,
      rateLimitOverrides: [],
    };

    const rateLimitService = RateLimitService.getInstance(redis as Redis);
    const mediaResult = await rateLimitService.rateLimitRequest(
      asScope(scope),
      "media-upload",
    );
    const ingestionResult = await rateLimitService.rateLimitRequest(
      asScope(scope),
      "ingestion",
    );

    expect(mediaResult?.res).toEqual({
      scope: scope,
      resource: "media-upload",
      points: 1000,
      remainingPoints: 999,
      msBeforeNext: expect.any(Number),
      consumedPoints: 1,
      isFirstInDuration: true,
    });
    expect(ingestionResult?.res).toEqual({
      scope: scope,
      resource: "ingestion",
      points: 1000,
      remainingPoints: 999,
      msBeforeNext: expect.any(Number),
      consumedPoints: 1,
      isFirstInDuration: true,
    });

    await expect(
      redis.get(`${RATE_LIMIT_REDIS_KEY_PREFIX}:media-upload:${orgId}`),
    ).resolves.toBeDefined();
    await expect(
      redis.get(`${RATE_LIMIT_REDIS_KEY_PREFIX}:ingestion:${orgId}`),
    ).resolves.toBeDefined();
  });
});
