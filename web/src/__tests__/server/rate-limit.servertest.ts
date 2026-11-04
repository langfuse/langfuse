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
      "X-RateLimit-Reset": expect.any(Number),
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

    // Every one of the N allowed requests, including the Nth, must resolve
    // as not rate-limited. rate-limiter-flexible floors remainingPoints at
    // 0 for the Nth request too, so asserting only on the final (N+1)th
    // call would miss a regression that flags the Nth request itself.
    for (let i = 1; i <= 5; i++) {
      const allowedResult = await rateLimitService.rateLimitRequest(
        asScope(scope),
        "public-api",
      );
      expect(allowedResult?.res?.consumedPoints).toBe(i);
      expect(allowedResult?.isRateLimited()).toBe(false);
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

  it("should apply annotation queue rate limits by cloud plan", async () => {
    const cases = [
      { plan: "cloud:hobby" as const, points: 100 },
      { plan: "cloud:core" as const, points: 1000 },
      { plan: "cloud:pro" as const, points: 1000 },
      { plan: "cloud:team" as const, points: 1000 },
      { plan: "cloud:enterprise" as const, points: 1000 },
    ];

    const rateLimitService = RateLimitService.getInstance(redis as Redis);

    for (const testCase of cases) {
      await redis.del(
        `${RATE_LIMIT_REDIS_KEY_PREFIX}:annotation-queues:${orgId}`,
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
        "annotation-queues",
      );

      expect(result?.res).toEqual({
        scope: scope,
        resource: "annotation-queues",
        points: testCase.points,
        remainingPoints: testCase.points - 1,
        msBeforeNext: expect.any(Number),
        consumedPoints: 1,
        isFirstInDuration: true,
      });
      expect(result?.isRateLimited()).toBe(false);
    }
  });

  it("should apply public-api-legacy rate limits by cloud plan", async () => {
    // Hobby and Core round their nominal hourly equivalent down (120 and
    // 420, versus the previous release's 150 and 450); Pro/Team/Enterprise
    // keep the same nominal 1,200/hour, now enforced over a 60s window.
    const cases = [
      { plan: "cloud:hobby" as const, points: 2, durationInSec: 60 },
      { plan: "cloud:core" as const, points: 7, durationInSec: 60 },
      { plan: "cloud:pro" as const, points: 20, durationInSec: 60 },
      { plan: "cloud:team" as const, points: 20, durationInSec: 60 },
      { plan: "cloud:enterprise" as const, points: 20, durationInSec: 60 },
    ];

    const rateLimitService = RateLimitService.getInstance(redis as Redis);

    for (const testCase of cases) {
      const activeKey = `${RATE_LIMIT_REDIS_KEY_PREFIX}:public-api-legacy:${orgId}`;

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

      const ttlInSec = await redis.ttl(activeKey);

      expect(ttlInSec).toBeGreaterThan(0);
      expect(ttlInSec).toBeLessThanOrEqual(testCase.durationInSec);
      expect(ttlInSec).toBeGreaterThan(testCase.durationInSec - 10);
    }
  });

  it("should admit exactly N requests and reject only the (N+1)th request (off-by-one regression)", async () => {
    // rate-limiter-flexible floors remainingPoints at 0 for both the Nth
    // (allowed) and (N+1)th (rejected) request, so remainingPoints alone
    // cannot decide rejection. Cover public-api-legacy plus other resources
    // to confirm the fix in checkRateLimit/isRateLimited is not limited to
    // one resource.
    const rateLimitService = RateLimitService.getInstance(redis as Redis);

    const cases: Array<{
      resource: "public-api" | "public-api-legacy" | "score-delete";
      points: number;
    }> = [
      { resource: "public-api-legacy", points: 3 },
      { resource: "public-api", points: 4 },
      { resource: "score-delete", points: 2 },
    ];

    for (const testCase of cases) {
      const scope = {
        orgId: orgId,
        plan: "cloud:hobby" as const,
        projectId,
        accessLevel: "project" as const,
        rateLimitOverrides: [
          {
            resource: testCase.resource,
            points: testCase.points,
            durationInSec: 60,
          },
        ],
      };

      for (let i = 1; i <= testCase.points; i++) {
        const result = await rateLimitService.rateLimitRequest(
          asScope(scope),
          testCase.resource,
        );
        expect(result?.res?.consumedPoints).toBe(i);
        expect(result?.res?.remainingPoints).toBe(testCase.points - i);
        expect(result?.isRateLimited()).toBe(false);
      }

      const rejected = await rateLimitService.rateLimitRequest(
        asScope(scope),
        testCase.resource,
      );

      expect(rejected?.res?.consumedPoints).toBe(testCase.points + 1);
      expect(rejected?.res?.remainingPoints).toBe(0);
      expect(rejected?.isRateLimited()).toBe(true);
    }
  });

  it("should admit exactly N concurrent requests and reject the rest", async () => {
    const points = 5;
    const extraRequests = 4;
    const scope = {
      orgId: orgId,
      plan: "cloud:hobby" as const,
      projectId,
      accessLevel: "project" as const,
      rateLimitOverrides: [
        { resource: "public-api-legacy" as const, points, durationInSec: 60 },
      ],
    };

    const rateLimitService = RateLimitService.getInstance(redis as Redis);

    const results = await Promise.all(
      Array.from({ length: points + extraRequests }, () =>
        rateLimitService.rateLimitRequest(asScope(scope), "public-api-legacy"),
      ),
    );

    const allowed = results.filter(
      (result) => result?.isRateLimited() === false,
    );
    const rejected = results.filter(
      (result) => result?.isRateLimited() === true,
    );

    expect(allowed).toHaveLength(points);
    expect(rejected).toHaveLength(extraRequests);

    // Redis's atomic increment must still hand out unique, sequential
    // consumedPoints values under concurrency.
    const consumedPointsSeen = results
      .map((result) => result?.res?.consumedPoints)
      .filter((value): value is number => typeof value === "number")
      .toSorted((a, b) => a - b);
    expect(consumedPointsSeen).toEqual(
      Array.from({ length: points + extraRequests }, (_, i) => i + 1),
    );
  });

  it("should admit requests again once the window has actually expired", async () => {
    const points = 2;
    const durationInSec = 1;
    const scope = {
      orgId: orgId,
      plan: "cloud:hobby" as const,
      projectId,
      accessLevel: "project" as const,
      rateLimitOverrides: [
        { resource: "public-api-legacy" as const, points, durationInSec },
      ],
    };

    const rateLimitService = RateLimitService.getInstance(redis as Redis);

    for (let i = 1; i <= points; i++) {
      const result = await rateLimitService.rateLimitRequest(
        asScope(scope),
        "public-api-legacy",
      );
      expect(result?.isRateLimited()).toBe(false);
    }

    const rejected = await rateLimitService.rateLimitRequest(
      asScope(scope),
      "public-api-legacy",
    );
    expect(rejected?.isRateLimited()).toBe(true);

    // Wait for the real Redis TTL to expire rather than deleting the key,
    // so this exercises the actual window-expiry behavior.
    await new Promise((resolve) =>
      setTimeout(resolve, (durationInSec + 1) * 1000),
    );

    const afterExpiry = await rateLimitService.rateLimitRequest(
      asScope(scope),
      "public-api-legacy",
    );

    expect(afterExpiry?.res).toEqual({
      scope: scope,
      resource: "public-api-legacy",
      points,
      remainingPoints: points - 1,
      msBeforeNext: expect.any(Number),
      consumedPoints: 1,
      isFirstInDuration: true,
    });
    expect(afterExpiry?.isRateLimited()).toBe(false);
  }, 10_000);

  it("should share the public-api-legacy bucket across legacy routes within an org, and isolate it between organizations", async () => {
    const otherOrgId = `rate-limit-test-org-${randomUUID()}`;
    const otherOrgPattern = `${RATE_LIMIT_REDIS_KEY_PREFIX}:*:${otherOrgId}`;

    try {
      const points = 3;
      const makeScope = (org: string) => ({
        orgId: org,
        plan: "cloud:hobby" as const,
        projectId,
        accessLevel: "project" as const,
        rateLimitOverrides: [
          {
            resource: "public-api-legacy" as const,
            points,
            durationInSec: 60,
          },
        ],
      });

      const rateLimitService = RateLimitService.getInstance(redis as Redis);

      // Legacy trace, observation, and session reads all call
      // checkRateLimit with the same "public-api-legacy" resource, so they
      // share one organization-level bucket regardless of which legacy
      // route issued the call. There is no per-route key to isolate here.
      const traceRead = await rateLimitService.rateLimitRequest(
        asScope(makeScope(orgId)),
        "public-api-legacy",
      );
      const observationRead = await rateLimitService.rateLimitRequest(
        asScope(makeScope(orgId)),
        "public-api-legacy",
      );
      const sessionRead = await rateLimitService.rateLimitRequest(
        asScope(makeScope(orgId)),
        "public-api-legacy",
      );

      expect(traceRead?.res?.consumedPoints).toBe(1);
      expect(observationRead?.res?.consumedPoints).toBe(2);
      expect(sessionRead?.res?.consumedPoints).toBe(3);
      expect(sessionRead?.isRateLimited()).toBe(false);

      // The organization's shared bucket is now exhausted...
      const exhausted = await rateLimitService.rateLimitRequest(
        asScope(makeScope(orgId)),
        "public-api-legacy",
      );
      expect(exhausted?.isRateLimited()).toBe(true);

      // ...but a different organization has its own, unaffected bucket.
      const otherOrgRead = await rateLimitService.rateLimitRequest(
        asScope(makeScope(otherOrgId)),
        "public-api-legacy",
      );
      expect(otherOrgRead?.res?.consumedPoints).toBe(1);
      expect(otherOrgRead?.isRateLimited()).toBe(false);
    } finally {
      await clearRedisKeysByPatternSafely(redis, otherOrgPattern);
    }
  });

  it("should apply a custom public-api-legacy override on the shared org key", async () => {
    const overridePoints = 2;
    const overrideDurationInSec = 5;
    const activeKey = `${RATE_LIMIT_REDIS_KEY_PREFIX}:public-api-legacy:${orgId}`;

    const overrideScope = {
      orgId: orgId,
      plan: "cloud:hobby" as const,
      projectId,
      accessLevel: "project" as const,
      rateLimitOverrides: [
        {
          resource: "public-api-legacy" as const,
          points: overridePoints,
          durationInSec: overrideDurationInSec,
        },
      ],
    };

    const rateLimitService = RateLimitService.getInstance(redis as Redis);

    const first = await rateLimitService.rateLimitRequest(
      asScope(overrideScope),
      "public-api-legacy",
    );
    expect(first?.res).toEqual({
      scope: overrideScope,
      resource: "public-api-legacy",
      points: overridePoints,
      remainingPoints: overridePoints - 1,
      msBeforeNext: expect.any(Number),
      consumedPoints: 1,
      isFirstInDuration: true,
    });
    expect(first?.isRateLimited()).toBe(false);

    const second = await rateLimitService.rateLimitRequest(
      asScope(overrideScope),
      "public-api-legacy",
    );
    expect(second?.isRateLimited()).toBe(false);

    const rejected = await rateLimitService.rateLimitRequest(
      asScope(overrideScope),
      "public-api-legacy",
    );
    expect(rejected?.isRateLimited()).toBe(true);

    const ttlInSec = await redis.ttl(activeKey);
    expect(ttlInSec).toBeGreaterThan(0);
    expect(ttlInSec).toBeLessThanOrEqual(overrideDurationInSec);
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

  it("should apply AI Gateway request and request-byte limits by cloud plan", async () => {
    const MiB = 1024 * 1024;
    const GiB = 1024 * MiB;
    const cases = [
      { plan: "cloud:hobby" as const, requests: 100, requestBytes: 64 * MiB },
      { plan: "cloud:core" as const, requests: 500, requestBytes: 256 * MiB },
      { plan: "cloud:pro" as const, requests: 10_000, requestBytes: 5 * GiB },
      { plan: "cloud:team" as const, requests: 10_000, requestBytes: 5 * GiB },
      {
        plan: "cloud:enterprise" as const,
        requests: 10_000,
        requestBytes: 5 * GiB,
      },
    ];

    const rateLimitService = RateLimitService.getInstance(redis as Redis);

    for (const testCase of cases) {
      await redis.del(
        `${RATE_LIMIT_REDIS_KEY_PREFIX}:ai-gateway-requests:${orgId}`,
      );
      await redis.del(
        `${RATE_LIMIT_REDIS_KEY_PREFIX}:ai-gateway-request-bytes:${orgId}`,
      );
      const scope = asScope({
        orgId,
        plan: testCase.plan,
        projectId,
        accessLevel: "organization",
        rateLimitOverrides: [],
      });

      const requests = await rateLimitService.rateLimitRequest(
        scope,
        "ai-gateway-requests",
      );
      const bytes = await rateLimitService.rateLimitRequest(
        scope,
        "ai-gateway-request-bytes",
        4096,
      );

      expect(requests?.res).toMatchObject({
        points: testCase.requests,
        consumedPoints: 1,
      });
      expect(bytes?.res).toMatchObject({
        points: testCase.requestBytes,
        consumedPoints: 4096,
        remainingPoints: testCase.requestBytes - 4096,
      });
      const ttlInSec = await redis.ttl(
        `${RATE_LIMIT_REDIS_KEY_PREFIX}:ai-gateway-request-bytes:${orgId}`,
      );
      expect(ttlInSec).toBeGreaterThan(0);
      expect(ttlInSec).toBeLessThanOrEqual(60);

      const atLimit = await rateLimitService.rateLimitRequest(
        scope,
        "ai-gateway-request-bytes",
        testCase.requestBytes - 4096,
      );
      expect(atLimit?.res?.consumedPoints).toBe(testCase.requestBytes);
      expect(atLimit?.isRateLimited()).toBe(false);

      const overLimit = await rateLimitService.rateLimitRequest(
        scope,
        "ai-gateway-request-bytes",
        1,
      );
      expect(overLimit?.res?.consumedPoints).toBe(testCase.requestBytes + 1);
      expect(overLimit?.isRateLimited()).toBe(true);
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
