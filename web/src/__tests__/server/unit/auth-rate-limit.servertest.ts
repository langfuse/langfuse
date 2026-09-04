import { createHash } from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { RateLimiterRes } from "rate-limiter-flexible";

const { env, mocks } = vi.hoisted(() => ({
  env: {
    LANGFUSE_RATE_LIMITS_ENABLED: "true",
  },
  mocks: {
    consume: vi.fn(),
    options: [] as Array<Record<string, unknown>>,
  },
}));

vi.mock("@/src/env.mjs", () => ({ env }));

vi.mock("rate-limiter-flexible", () => {
  class MockRateLimiterRes {
    remainingPoints = 0;
    constructor(public msBeforeNext = 1000) {}
  }

  class MockRateLimiterRedis {
    consume = mocks.consume;

    constructor(options: Record<string, unknown>) {
      mocks.options.push(options);
    }
  }

  return {
    RateLimiterRedis: MockRateLimiterRedis,
    RateLimiterRes: MockRateLimiterRes,
  };
});

vi.mock("@langfuse/shared/src/server", () => ({
  ClickHouseClientManager: {
    getInstance: () => ({ closeAllConnections: vi.fn() }),
  },
  createNewRedisInstance: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  recordIncrement: vi.fn(),
  redis: null,
  redisQueueRetryOptions: {},
}));

import {
  AUTH_RATE_LIMIT_REDIS_KEY_PREFIX,
  AuthRateLimitService,
  applyAuthRateLimit,
  getEmailFromRequestBody,
  getRequestIp,
} from "@/src/features/auth-credentials/server/authRateLimit";

describe("auth rate limiting helpers", () => {
  it("reads the first x-forwarded-for hop, then x-real-ip", () => {
    const { req: forwarded } = createMocks<NextApiRequest>({
      headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" },
    });
    expect(getRequestIp(forwarded)).toBe("203.0.113.10");

    const { req: realIp } = createMocks<NextApiRequest>({
      headers: { "x-real-ip": "198.51.100.7" },
    });
    expect(getRequestIp(realIp)).toBe("198.51.100.7");
  });

  it("normalizes emails from JSON bodies and ignores invalid values", () => {
    expect(getEmailFromRequestBody({ email: "  User@Example.COM " })).toBe(
      "user@example.com",
    );
    expect(getEmailFromRequestBody({ email: "not-an-email" })).toBeUndefined();
    expect(getEmailFromRequestBody(undefined)).toBeUndefined();
  });
});

describe("AuthRateLimitService", () => {
  const originalRateLimitsEnabled = env.LANGFUSE_RATE_LIMITS_ENABLED;

  const redis = () =>
    ({
      status: "ready",
      disconnect: vi.fn(),
    }) as any;

  beforeEach(() => {
    (env as any).LANGFUSE_RATE_LIMITS_ENABLED = "true";
    AuthRateLimitService.shutdown();
    mocks.consume.mockReset();
    mocks.consume.mockResolvedValue({});
    mocks.options.length = 0;
  });

  afterEach(() => {
    (env as any).LANGFUSE_RATE_LIMITS_ENABLED = originalRateLimitsEnabled;
    AuthRateLimitService.shutdown();
  });

  it("uses per-IP then hashed-email Redis buckets for login", async () => {
    const client = redis();
    const hit = await AuthRateLimitService.getInstance(client).consume({
      resource: "auth-login",
      ip: "203.0.113.10",
      email: "user@example.com",
    });

    expect(hit).toBeUndefined();
    expect(mocks.options).toMatchObject([
      {
        keyPrefix: `${AUTH_RATE_LIMIT_REDIS_KEY_PREFIX}:auth-login:ip`,
        points: 30,
        duration: 15 * 60,
      },
      {
        keyPrefix: `${AUTH_RATE_LIMIT_REDIS_KEY_PREFIX}:auth-login:email`,
        points: 10,
        duration: 15 * 60,
      },
    ]);
    expect(mocks.consume.mock.calls).toEqual([
      ["203.0.113.10"],
      [createHash("sha256").update("user@example.com").digest("hex")],
    ]);
  });

  it("rate-limits signup by IP only so a spoofed email cannot lock out a victim", async () => {
    const client = redis();
    const hit = await AuthRateLimitService.getInstance(client).consume({
      resource: "auth-signup",
      ip: "203.0.113.10",
      email: "victim@example.com",
    });

    expect(hit).toBeUndefined();
    expect(mocks.options).toMatchObject([
      {
        keyPrefix: `${AUTH_RATE_LIMIT_REDIS_KEY_PREFIX}:auth-signup:ip`,
        points: 10,
        duration: 60 * 60,
      },
    ]);
    expect(mocks.consume.mock.calls).toEqual([["203.0.113.10"]]);
  });

  it("uses tighter signup buckets and fails open when Redis is unavailable", async () => {
    await AuthRateLimitService.getInstance(redis()).consume({
      resource: "auth-signup",
      ip: "203.0.113.10",
    });
    expect(mocks.options).toMatchObject([
      {
        keyPrefix: `${AUTH_RATE_LIMIT_REDIS_KEY_PREFIX}:auth-signup:ip`,
        points: 10,
        duration: 60 * 60,
      },
    ]);

    AuthRateLimitService.shutdown();
    mocks.options.length = 0;
    (env as any).LANGFUSE_RATE_LIMITS_ENABLED = "false";
    await expect(
      AuthRateLimitService.getInstance(null).consume({
        resource: "auth-login",
        ip: "203.0.113.10",
      }),
    ).resolves.toBeUndefined();
    expect(mocks.options).toHaveLength(0);
    (env as any).LANGFUSE_RATE_LIMITS_ENABLED = "true";

    AuthRateLimitService.shutdown();
    await expect(
      AuthRateLimitService.getInstance(null).consume({
        resource: "auth-login",
        ip: "203.0.113.10",
      }),
    ).resolves.toBeUndefined();

    AuthRateLimitService.shutdown();
    mocks.consume.mockRejectedValueOnce(new Error("redis down"));
    await expect(
      AuthRateLimitService.getInstance(redis()).consume({
        resource: "auth-login",
        ip: "203.0.113.10",
      }),
    ).resolves.toBeUndefined();
  });

  it("returns a rate-limit hit when the IP bucket is exhausted", async () => {
    mocks.consume.mockRejectedValueOnce(new (RateLimiterRes as any)(4500));
    const hit = await AuthRateLimitService.getInstance(redis()).consume({
      resource: "auth-login",
      ip: "203.0.113.10",
      email: "user@example.com",
    });

    expect(hit).toMatchObject({
      resource: "auth-login",
      keyKind: "ip",
      points: 30,
      remainingPoints: 0,
      msBeforeNext: 4500,
    });
    expect(mocks.consume).toHaveBeenCalledTimes(1);
  });
});

describe("applyAuthRateLimit", () => {
  const originalRateLimitsEnabled = env.LANGFUSE_RATE_LIMITS_ENABLED;

  beforeEach(() => {
    (env as any).LANGFUSE_RATE_LIMITS_ENABLED = "true";
    AuthRateLimitService.shutdown();
    mocks.consume.mockReset();
    mocks.consume.mockResolvedValue({});
    mocks.options.length = 0;
  });

  afterEach(() => {
    (env as any).LANGFUSE_RATE_LIMITS_ENABLED = originalRateLimitsEnabled;
    AuthRateLimitService.shutdown();
  });

  it("sends 429 with Retry-After when limited and otherwise allows the request", async () => {
    const redis = {
      status: "ready",
      disconnect: vi.fn(),
    } as any;
    AuthRateLimitService.getInstance(redis);

    const allowed = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.10" },
      body: { email: "user@example.com" },
    });
    await expect(
      applyAuthRateLimit(allowed.req, allowed.res, "auth-login"),
    ).resolves.toBe(false);
    expect(allowed.res._getStatusCode()).toBe(200);

    mocks.consume.mockRejectedValueOnce(new (RateLimiterRes as any)(2300));
    const limited = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.10" },
      body: { email: "user@example.com" },
    });
    await expect(
      applyAuthRateLimit(limited.req, limited.res, "auth-login"),
    ).resolves.toBe(true);
    expect(limited.res._getStatusCode()).toBe(429);
    expect(limited.res.getHeader("Retry-After")).toBe(3);
    expect(limited.res._getJSONData()).toEqual({
      message: "Too many requests. Please retry in 3 seconds.",
    });
  });
});
