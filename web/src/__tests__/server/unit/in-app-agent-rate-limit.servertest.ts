import type { ApiAccessScope } from "@langfuse/shared/src/server";

const rateLimitRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/src/features/public-api/server/RateLimitService", () => ({
  RateLimitService: {
    getInstance: () => ({ rateLimitRequest: rateLimitRequestMock }),
  },
}));

import { checkInAppAgentRateLimit } from "@/src/features/in-app-agent/server/rateLimit";

const scope: ApiAccessScope = {
  orgId: "org-1",
  plan: "cloud:team",
  projectId: "project-1",
  accessLevel: "project",
  rateLimitOverrides: [],
  apiKeyId: "in-app-agent-session",
  publicKey: "in-app-agent-session",
  isIngestionSuspended: false,
};

describe("checkInAppAgentRateLimit", () => {
  beforeEach(() => {
    rateLimitRequestMock.mockReset();
    rateLimitRequestMock.mockResolvedValue({
      isRateLimited: () => false,
      res: undefined,
    });
  });

  it("uses distinct per-user buckets while retaining the organization bucket", async () => {
    await checkInAppAgentRateLimit(scope, "user-a", "in-app-agent-run");
    await checkInAppAgentRateLimit(scope, "user-b", "in-app-agent-run");

    expect(rateLimitRequestMock.mock.calls).toEqual([
      [
        scope,
        "in-app-agent-run",
        { type: "user", userId: "user-a", pointsMultiplier: 0.5 },
      ],
      [scope, "in-app-agent-run"],
      [
        scope,
        "in-app-agent-run",
        { type: "user", userId: "user-b", pointsMultiplier: 0.5 },
      ],
      [scope, "in-app-agent-run"],
    ]);
  });

  it("does not consume the organization bucket after the user is limited", async () => {
    const rateLimitResult = {
      resource: "in-app-agent-run" as const,
      scope,
      points: 500,
      remainingPoints: 0,
      msBeforeNext: 60_000,
      consumedPoints: 501,
      isFirstInDuration: false,
    };
    rateLimitRequestMock.mockResolvedValueOnce({
      isRateLimited: () => true,
      res: rateLimitResult,
    });

    await expect(
      checkInAppAgentRateLimit(scope, "user-a", "in-app-agent-run"),
    ).resolves.toBe(rateLimitResult);
    expect(rateLimitRequestMock).toHaveBeenCalledTimes(1);
  });
});
