import { RateLimiterRes } from "rate-limiter-flexible";

import {
  enforceFeedbackRateLimit,
  FEEDBACK_RATE_LIMIT_REDIS_KEY_PREFIX,
} from "@/src/features/feedback/server/FeedbackRateLimitService";

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

describe("feedback rate limiting", () => {
  const redis = {} as any;

  beforeEach(() => {
    mocks.consume.mockReset();
    mocks.consume.mockResolvedValue({});
    mocks.options.length = 0;
  });

  it("enforces principal and global limits and fails closed", async () => {
    await enforceFeedbackRateLimit(
      { source: "public-api", orgId: "org-1" },
      redis,
    );

    expect(mocks.options).toMatchObject([
      {
        keyPrefix: `${FEEDBACK_RATE_LIMIT_REDIS_KEY_PREFIX}:principal-minute`,
        points: 5,
        duration: 60,
      },
      {
        keyPrefix: `${FEEDBACK_RATE_LIMIT_REDIS_KEY_PREFIX}:principal-day`,
        points: 10,
        duration: 86_400,
      },
      {
        keyPrefix: `${FEEDBACK_RATE_LIMIT_REDIS_KEY_PREFIX}:global-second`,
        points: 1,
        duration: 1,
      },
      {
        keyPrefix: `${FEEDBACK_RATE_LIMIT_REDIS_KEY_PREFIX}:global-day`,
        points: 100,
        duration: 86_400,
      },
    ]);
    expect(mocks.consume.mock.calls).toEqual([
      ["org:org-1"],
      ["org:org-1"],
      ["feedback"],
      ["feedback"],
    ]);

    mocks.consume.mockReset();
    mocks.consume.mockRejectedValueOnce(new (RateLimiterRes as any)(1000));
    await expect(
      enforceFeedbackRateLimit({ source: "langfuse-docs-mcp" }, redis),
    ).rejects.toMatchObject({ httpCode: 429 });

    mocks.consume.mockReset();
    mocks.consume.mockRejectedValueOnce(new Error("redis unavailable"));
    await expect(
      enforceFeedbackRateLimit({ source: "langfuse-docs-mcp" }, redis),
    ).rejects.toMatchObject({ httpCode: 503 });
  });
});
