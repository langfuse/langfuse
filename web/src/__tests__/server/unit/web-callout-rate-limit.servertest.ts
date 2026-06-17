import { RateLimiterRes } from "rate-limiter-flexible";

import {
  WEB_CALLOUT_RATE_LIMIT_REDIS_KEY_PREFIX,
  WebCalloutRateLimitService,
  resetWebCalloutInFlightLimitsForTests,
  withWebCalloutInFlightLimit,
} from "@/src/features/web-callouts/server/rateLimit";
import { env } from "@/src/env.mjs";

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
  ClickHouseClientManager: {
    getInstance: () => ({ closeAllConnections: vi.fn() }),
  },
  createNewRedisInstance: vi.fn(),
  logger: { debug: vi.fn(), warn: vi.fn() },
  recordIncrement: vi.fn(),
  redis: null,
  redisQueueRetryOptions: {},
}));

describe("web callout rate limiting", () => {
  const originalRateLimitsEnabled = env.LANGFUSE_RATE_LIMITS_ENABLED;
  const context = {
    orgId: "org-1",
    projectId: "project-1",
    endpointId: "endpoint-1",
    userId: "user-1",
  };

  const redis = () =>
    ({
      status: "ready",
      disconnect: vi.fn(),
    }) as any;

  const pending = () => new Promise<never>(() => undefined);

  beforeEach(() => {
    (env as any).LANGFUSE_RATE_LIMITS_ENABLED = "true";
    WebCalloutRateLimitService.shutdown();
    resetWebCalloutInFlightLimitsForTests();
    mocks.consume.mockReset();
    mocks.consume.mockResolvedValue({});
    mocks.options.length = 0;
  });

  afterEach(() => {
    (env as any).LANGFUSE_RATE_LIMITS_ENABLED = originalRateLimitsEnabled;
    WebCalloutRateLimitService.shutdown();
    resetWebCalloutInFlightLimitsForTests();
  });

  it("uses scoped 10/60 Redis buckets, shares cold connects, and fails open when Redis is unavailable", async () => {
    const client = redis();
    await WebCalloutRateLimitService.getInstance(client).consume(context);

    expect(mocks.options).toMatchObject([
      {
        keyPrefix: `${WEB_CALLOUT_RATE_LIMIT_REDIS_KEY_PREFIX}:user`,
        points: 10,
        duration: 60,
      },
      {
        keyPrefix: `${WEB_CALLOUT_RATE_LIMIT_REDIS_KEY_PREFIX}:endpoint`,
        points: 60,
        duration: 60,
      },
    ]);
    expect(mocks.options.map(({ storeClient }) => storeClient)).toEqual([
      client,
      client,
    ]);
    expect(mocks.consume.mock.calls).toEqual([
      ["org-1:project-1:endpoint-1:user-1"],
      ["org-1:project-1:endpoint-1"],
    ]);

    WebCalloutRateLimitService.shutdown();
    let resolveConnect: (() => void) | undefined;
    const coldClient = {
      status: "wait",
      connect: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveConnect = () => {
              coldClient.status = "ready";
              resolve();
            };
          }),
      ),
      disconnect: vi.fn(),
    } as any;
    const service = WebCalloutRateLimitService.getInstance(coldClient);
    const concurrentConsumes = Promise.all([
      service.consume(context),
      service.consume({ ...context, userId: "user-2" }),
    ]);
    expect(coldClient.connect).toHaveBeenCalledTimes(1);
    resolveConnect?.();
    await concurrentConsumes;

    WebCalloutRateLimitService.shutdown();
    mocks.options.length = 0;
    (env as any).LANGFUSE_RATE_LIMITS_ENABLED = "false";
    await expect(
      WebCalloutRateLimitService.getInstance(null).consume(context),
    ).resolves.toBeUndefined();
    expect(mocks.options).toHaveLength(0);
    (env as any).LANGFUSE_RATE_LIMITS_ENABLED = "true";

    WebCalloutRateLimitService.shutdown();
    await expect(
      WebCalloutRateLimitService.getInstance(null).consume(context),
    ).resolves.toBeUndefined();

    WebCalloutRateLimitService.shutdown();
    mocks.consume.mockClear();
    mocks.consume.mockRejectedValueOnce(new Error("redis down"));
    await expect(
      WebCalloutRateLimitService.getInstance(redis()).consume(context),
    ).resolves.toBeUndefined();
    expect(mocks.consume).toHaveBeenCalledTimes(1);

    WebCalloutRateLimitService.shutdown();
    mocks.consume.mockReset();
    mocks.consume.mockRejectedValueOnce(new (RateLimiterRes as any)(2300));
    await expect(
      WebCalloutRateLimitService.getInstance(redis()).consume(context),
    ).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message:
        "Web callout invocation rate limit exceeded. Please retry in 3 seconds.",
    });
  });

  it("rejects endpoint and process concurrency above local caps", async () => {
    const endpointSlots = Array.from({ length: 5 }, () =>
      withWebCalloutInFlightLimit(context, pending),
    );
    await expect(
      withWebCalloutInFlightLimit(context, async () => "rejected"),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(endpointSlots).toHaveLength(5);

    resetWebCalloutInFlightLimitsForTests();
    const processSlots = Array.from({ length: 25 }, (_, index) =>
      withWebCalloutInFlightLimit(
        { ...context, endpointId: `endpoint-${index}` },
        pending,
      ),
    );
    await expect(
      withWebCalloutInFlightLimit(
        { ...context, endpointId: "endpoint-2" },
        async () => "rejected",
      ),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(processSlots).toHaveLength(25);
  });
});
