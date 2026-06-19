import type { NextApiRequest } from "next";
import { RateLimiterRes } from "rate-limiter-flexible";

import { env } from "@/src/env.mjs";

// Mock the Redis-backed limiter so the test is deterministic and does not depend
// on a live Redis (mirrors web-callout-rate-limit.servertest.ts). We assert how
// the limiter is wired and how allow() maps consume() outcomes to allow/deny,
// not the behavior of rate-limiter-flexible or Redis itself.
const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  options: [] as Array<Record<string, unknown>>,
}));

vi.mock("rate-limiter-flexible", () => {
  class MockRateLimiterRes {
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
  createNewRedisInstance: vi.fn(),
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  redisQueueRetryOptions: {},
  // Provided so the shared global teardown (which imports these from the same
  // module) keeps working under this mock.
  redis: null,
  ClickHouseClientManager: {
    getInstance: () => ({ closeAllConnections: vi.fn() }),
  },
}));

import {
  allowSlackMarketplaceInstall,
  SlackMarketplaceInstallRateLimiter,
} from "@/src/features/slack/server/marketplaceInstallRateLimit";

const KEY_PREFIX = "rate-limit:slack-marketplace-install";
const POINTS = 30;
const DURATION_SECONDS = 5 * 60;

function reqWithXff(xff: string): NextApiRequest {
  return {
    headers: { "x-forwarded-for": xff },
    socket: { remoteAddress: "10.0.0.1" },
  } as unknown as NextApiRequest;
}

/** A fake ioredis client that is already "ready" so ensureReady() is a no-op. */
const readyRedis = () =>
  ({ status: "ready", disconnect: vi.fn(), connect: vi.fn() }) as any;

describe("SlackMarketplaceInstallRateLimiter", () => {
  const originalRateLimitsEnabled = env.LANGFUSE_RATE_LIMITS_ENABLED;

  beforeEach(() => {
    (env as any).LANGFUSE_RATE_LIMITS_ENABLED = "true";
    SlackMarketplaceInstallRateLimiter.shutdown();
    mocks.consume.mockReset();
    mocks.consume.mockResolvedValue({});
    mocks.options.length = 0;
  });

  afterEach(() => {
    (env as any).LANGFUSE_RATE_LIMITS_ENABLED = originalRateLimitsEnabled;
    SlackMarketplaceInstallRateLimiter.shutdown();
  });

  it("fails open without ever consuming when Redis is not configured", async () => {
    const limiter = SlackMarketplaceInstallRateLimiter.getInstance(null);
    for (let i = 0; i < POINTS + 5; i++) {
      expect(await limiter.allow(reqWithXff("1.2.3.4"))).toBe(true);
    }
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.options).toHaveLength(0);
  });

  it("fails open without consuming when rate limiting is disabled", async () => {
    (env as any).LANGFUSE_RATE_LIMITS_ENABLED = "false";
    const limiter =
      SlackMarketplaceInstallRateLimiter.getInstance(readyRedis());
    expect(await limiter.allow(reqWithXff("1.2.3.4"))).toBe(true);
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it("configures the limiter with the expected window and key prefix", async () => {
    const limiter =
      SlackMarketplaceInstallRateLimiter.getInstance(readyRedis());
    await limiter.allow(reqWithXff("1.2.3.4"));
    expect(mocks.options).toMatchObject([
      { keyPrefix: KEY_PREFIX, points: POINTS, duration: DURATION_SECONDS },
    ]);
  });

  it("allows while consume succeeds and denies when the limiter rejects", async () => {
    const limiter =
      SlackMarketplaceInstallRateLimiter.getInstance(readyRedis());
    expect(await limiter.allow(reqWithXff("1.2.3.4"))).toBe(true);

    mocks.consume.mockRejectedValueOnce(new RateLimiterRes(1000));
    expect(await limiter.allow(reqWithXff("1.2.3.4"))).toBe(false);
  });

  it("fails open when Redis errors (non-RateLimiterRes)", async () => {
    const limiter =
      SlackMarketplaceInstallRateLimiter.getInstance(readyRedis());
    mocks.consume.mockRejectedValueOnce(new Error("redis down"));
    expect(await limiter.allow(reqWithXff("1.2.3.4"))).toBe(true);
  });

  it("keys on the rightmost X-Forwarded-For entry (last trusted proxy hop)", async () => {
    SlackMarketplaceInstallRateLimiter.getInstance(readyRedis());
    await allowSlackMarketplaceInstall(reqWithXff("1.1.1.1, 2.2.2.2, 3.3.3.3"));
    expect(mocks.consume).toHaveBeenCalledWith("3.3.3.3");
  });
});
