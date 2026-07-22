import {
  enforceFeedbackRateLimit,
  FEEDBACK_RATE_LIMIT_REDIS_KEY_PREFIX,
} from "@/src/features/feedback/server/FeedbackRateLimitService";

describe("feedback rate limiting", () => {
  const evalCommand = vi.fn();
  const redis = { eval: evalCommand } as any;

  beforeEach(() => {
    evalCommand.mockReset();
    evalCommand.mockResolvedValue(1);
  });

  it("atomically enforces principal and global limits", async () => {
    await enforceFeedbackRateLimit(
      { source: "public-api", orgId: "org-1" },
      redis,
    );

    expect(evalCommand).toHaveBeenCalledTimes(1);
    expect(evalCommand).toHaveBeenCalledWith(
      expect.any(String),
      4,
      `${FEEDBACK_RATE_LIMIT_REDIS_KEY_PREFIX}:principal-minute:org:org-1`,
      `${FEEDBACK_RATE_LIMIT_REDIS_KEY_PREFIX}:principal-day:org:org-1`,
      `${FEEDBACK_RATE_LIMIT_REDIS_KEY_PREFIX}:global-second`,
      `${FEEDBACK_RATE_LIMIT_REDIS_KEY_PREFIX}:global-day`,
      5,
      60,
      20,
      86_400,
      1,
      1,
      100,
      86_400,
    );
  });

  it("uses the docs source as the principal and returns 429 atomically", async () => {
    evalCommand.mockResolvedValue(0);

    await expect(
      enforceFeedbackRateLimit({ source: "langfuse-docs-mcp" }, redis),
    ).rejects.toMatchObject({ httpCode: 429 });

    expect(evalCommand).toHaveBeenCalledWith(
      expect.any(String),
      4,
      `${FEEDBACK_RATE_LIMIT_REDIS_KEY_PREFIX}:principal-minute:source:langfuse-docs-mcp`,
      `${FEEDBACK_RATE_LIMIT_REDIS_KEY_PREFIX}:principal-day:source:langfuse-docs-mcp`,
      `${FEEDBACK_RATE_LIMIT_REDIS_KEY_PREFIX}:global-second`,
      `${FEEDBACK_RATE_LIMIT_REDIS_KEY_PREFIX}:global-day`,
      5,
      60,
      20,
      86_400,
      1,
      1,
      100,
      86_400,
    );
  });

  it("fails closed when Redis is unavailable", async () => {
    evalCommand.mockRejectedValueOnce(new Error("redis unavailable"));

    await expect(
      enforceFeedbackRateLimit({ source: "langfuse-docs-mcp" }, redis),
    ).rejects.toMatchObject({ httpCode: 503 });
  });
});
