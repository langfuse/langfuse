import type { RateLimitResult } from "@langfuse/shared";
import { ClickHouseResourceError } from "@langfuse/shared/src/server";
import { EvaluatorVersionConflictError } from "@/src/features/evals/v2/server/evaluators/evaluatorErrors";
import {
  createStructuredPublicApiRateLimitError,
  structuredPublicApiErrorContract,
  toStructuredPublicApiError,
} from "@/src/features/public-api/server";

describe("structured public api error contract", () => {
  it("uses one contract marker", () => {
    expect(structuredPublicApiErrorContract).toBe("structured");
  });

  it("maps evaluator version conflicts to the conflict code", () => {
    const error = toStructuredPublicApiError(
      new EvaluatorVersionConflictError(),
    );

    expect(error.name).toBe("StructuredPublicApiError");
    expect(error.httpCode).toBe(409);
    expect(error.code).toBe("conflict");
  });

  it("only emits shared codes for mapped errors", () => {
    const resourceError = new ClickHouseResourceError(
      "TIMEOUT",
      new Error("timed out"),
    );

    expect(toStructuredPublicApiError(resourceError).code).toBe(
      "invalid_request",
    );
  });

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

    const error = createStructuredPublicApiRateLimitError(rateLimitResult, {
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
