import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";

vi.mock("@/src/env.mjs", () => ({
  env: {
    LANGFUSE_RATE_LIMITS_ENABLED: "true",
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "us",
  },
}));

vi.mock("@langfuse/shared/src/env", () => ({
  env: {
    REDIS_KEY_PREFIX: undefined,
  },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  ClickHouseClientManager: {
    getInstance: () => ({
      closeAllConnections: vi.fn(async () => undefined),
    }),
  },
  createNewRedisInstance: vi.fn(),
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  recordIncrement: vi.fn(),
  redis: null,
  redisQueueRetryOptions: {},
}));

vi.mock(
  "@/src/features/public-api/server/unstable-public-api-error-contract",
  () => ({
    createUnstablePublicApiRateLimitError: vi.fn(),
    sendUnstablePublicApiErrorResponse: vi.fn(),
    unstablePublicEvalsErrorContract: "unstable-public-evals",
  }),
);

import { sendRateLimitResponse } from "@/src/features/public-api/server/RateLimitService";

describe("sendRateLimitResponse", () => {
  const rateLimitRes = {
    points: 10,
    remainingPoints: -1,
    msBeforeNext: 2500,
    resource: "public-api" as const,
    scope: {
      orgId: "org-1",
      plan: "cloud:hobby" as const,
      projectId: "project-1",
      accessLevel: "project" as const,
      rateLimitOverrides: [],
    },
    consumedPoints: 11,
    isFirstInDuration: false,
  };

  it("returns retry metadata in stable public API responses", () => {
    const { res } = createMocks<NextApiRequest, NextApiResponse>();

    sendRateLimitResponse(res, rateLimitRes);

    expect(res.statusCode).toBe(429);
    expect(res.getHeader("Retry-After")).toBe(3);
    expect(res.getHeader("X-RateLimit-Remaining")).toBe(0);
    expect(res._getJSONData()).toEqual({
      message: "Rate limit exceeded. Please retry after 3 seconds.",
      error: "RateLimitExceeded",
      resource: "public-api",
      retryAfterSeconds: 3,
      limit: 10,
      remaining: 0,
      resetAt: expect.any(String),
    });
  });

  it("includes route-specific upgrade guidance when provided", () => {
    const { res } = createMocks<NextApiRequest, NextApiResponse>();
    const upgradePath = {
      legacyEndpoint: "GET /api/public/traces/{traceId}",
      replacementEndpoint:
        "GET /api/public/v2/observations?traceId={traceId}&fromStartTime=<from>&toStartTime=<to>",
      docsUrl:
        "https://langfuse.com/docs/api-and-data-platform/features/observations-api",
      notes: ["Group returned rows by traceId to reconstruct trace activity."],
    };

    sendRateLimitResponse(res, rateLimitRes, {
      message:
        "Rate limit exceeded for this legacy public API endpoint. Use the v2 Observations API for high-volume reads.",
      upgradePath,
    });

    expect(res.statusCode).toBe(429);
    expect(res._getJSONData()).toEqual({
      message:
        "Rate limit exceeded for this legacy public API endpoint. Use the v2 Observations API for high-volume reads.",
      error: "RateLimitExceeded",
      resource: "public-api",
      retryAfterSeconds: 3,
      limit: 10,
      remaining: 0,
      resetAt: expect.any(String),
      upgradePath,
    });
  });
});
