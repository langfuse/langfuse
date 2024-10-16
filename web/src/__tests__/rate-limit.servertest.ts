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

  it("should rate limit", async () => {
    const scope = {
      orgId: orgId,
      plan: "cloud:hobby" as const,
      projectId: "test-project-id",
      accessLevel: "all" as const,
      rateLimitOverrides: [],
    };

    expect(redis).toBeDefined();

    const rateLimitService = new RateLimitService(redis!);
    const result = await rateLimitService.rateLimitRequest(scope, "public-api");

    expect(result?.res).toEqual({
      scope: scope,
      resource: "public-api",
      points: 1000,
      remainingPoints: 999,
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
      accessLevel: "all" as const,
      rateLimitOverrides: [],
    };

    const rateLimitService = new RateLimitService(redis!);
    await rateLimitService.rateLimitRequest(scope, "public-api");

    const result = await rateLimitService.rateLimitRequest(scope, "public-api");

    expect(result?.res).toEqual({
      scope: scope,
      resource: "public-api",
      points: 1000,
      remainingPoints: 998,
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
      accessLevel: "all" as const,
      rateLimitOverrides: [
        { resource: "public-api" as const, points: 100, durationInSec: 2 },
      ],
    };

    const rateLimitService = new RateLimitService(redis!);
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
      accessLevel: "all" as const,
      rateLimitOverrides: [
        { resource: "public-api" as const, points: 5, durationInSec: 60 },
      ],
    };

    const rateLimitService = new RateLimitService(redis!);

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
      accessLevel: "all" as const,
      rateLimitOverrides: [
        { resource: "public-api" as const, points: 5, durationInSec: 10 },
      ],
    };

    const rateLimitService = new RateLimitService(redis!);

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
      accessLevel: "all" as const,
      rateLimitOverrides: [
        { resource: "public-api" as const, points: 5, durationInSec: 10 },
      ],
    };

    const rateLimitService = new RateLimitService(redis!);

    const result = await rateLimitService.rateLimitRequest(scope, "prompts");

    expect(result?.res).toBeUndefined();
    expect(result?.isRateLimited()).toBe(false);
  });

  it("should not apply rate limits for ingestion when overridden to null in API key", async () => {
    const scope = {
      orgId: orgId,
      plan: "cloud:hobby" as const,
      projectId: "test-project-id",
      accessLevel: "all" as const,
      rateLimitOverrides: [
        { resource: "ingestion" as const, points: null, durationInSec: null },
      ],
    };

    const rateLimitService = new RateLimitService(redis!);

    const result = await rateLimitService.rateLimitRequest(scope, "ingestion");

    expect(result?.res).toBeUndefined();
  });

  it("should not apply rate limits when redis is not defined", async () => {
    const scope = {
      orgId: orgId,
      plan: "cloud:hobby" as const,
      projectId: "test-project-id",
      accessLevel: "all" as const,
      rateLimitOverrides: [
        { resource: "public-api" as const, points: 5, durationInSec: 10 },
      ],
    };

    const rateLimitService = new RateLimitService(null);

    const result = await rateLimitService.rateLimitRequest(scope, "public-api");

    expect(result?.res).toBeUndefined();
    expect(result?.isRateLimited()).toBe(false);
  });

  it("should not apply rate limits for OSS plan", async () => {
    const scope = {
      orgId: orgId,
      plan: "oss" as const,
      projectId: "test-project-id",
      accessLevel: "all" as const,
      rateLimitOverrides: [],
    };

    const rateLimitService = new RateLimitService(redis!);

    const result = await rateLimitService.rateLimitRequest(scope, "public-api");

    expect(result?.res).toBeUndefined();
    expect(result?.isRateLimited()).toBe(false);
  });
});
