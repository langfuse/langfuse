import type { RateLimitResult } from "@langfuse/shared";
import { createUnstablePublicApiRateLimitError } from "@/src/features/public-api/server/unstable-public-api-error-contract";

describe("unstable public api error contract", () => {
  it("supports upgrade path rate limit messages and clamps remaining points", () => {
    const upgradePath = {
      legacyEndpoint: "GET /api/public/traces",
      replacementEndpoint:
        "GET /api/public/v2/observations?fromStartTime=<from>&toStartTime=<to>",
      docsUrl:
        "https://langfuse.com/docs/api-and-data-platform/features/observations-api",
    };
    const rateLimitResult = {
      points: 10,
      remainingPoints: -1,
      msBeforeNext: 2500,
      resource: "public-api",
      scope: {
        projectId: "project-1",
        orgId: "org-1",
        plan: "cloud:hobby",
        accessLevel: "project",
        rateLimitOverrides: [],
        apiKeyId: "api-key-1",
        publicKey: "pk-test",
        isIngestionSuspended: false,
        isInAppAgentKey: false,
      },
      consumedPoints: 11,
      isFirstInDuration: false,
    } satisfies RateLimitResult;

    const error = createUnstablePublicApiRateLimitError(rateLimitResult, {
      upgradePath,
    });

    expect(error.httpCode).toBe(429);
    expect(error.code).toBe("rate_limited");
    expect(error.message).toBe(
      "Rate limit exceeded for GET /api/public/traces. Use GET /api/public/v2/observations?fromStartTime=<from>&toStartTime=<to> for high-volume reads.",
    );
    expect(error.details).toEqual({
      retryAfterSeconds: 3,
      limit: 10,
      remaining: 0,
      resetAt: expect.any(String),
    });
  });
});
