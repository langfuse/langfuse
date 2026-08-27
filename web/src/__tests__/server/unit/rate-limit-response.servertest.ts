import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import type { RateLimitResult } from "@langfuse/shared";

const {
  mockCreateUnstablePublicApiRateLimitError,
  mockSendUnstablePublicApiErrorResponse,
} = vi.hoisted(() => ({
  mockCreateUnstablePublicApiRateLimitError: vi.fn(
    (
      rateLimitRes: RateLimitResult,
      options?: {
        errorContract?: string;
        upgradePath?: { legacyEndpoint: string; replacementEndpoint: string };
      },
    ) => {
      const message = options?.upgradePath
        ? `Rate limit exceeded for ${options.upgradePath.legacyEndpoint}. Use ${options.upgradePath.replacementEndpoint} for high-volume reads.`
        : "Rate limit exceeded";

      return {
        httpCode: 429,
        code: "rate_limited",
        message,
        details: {
          retryAfterSeconds: Math.ceil(rateLimitRes.msBeforeNext / 1000),
          limit: rateLimitRes.points,
          remaining: Math.max(0, rateLimitRes.remainingPoints),
          resetAt: new Date(
            Date.now() + rateLimitRes.msBeforeNext,
          ).toISOString(),
        },
      };
    },
  ),
  mockSendUnstablePublicApiErrorResponse: vi.fn((res, error) =>
    res.status(error.httpCode).json({
      message: error.message,
      code: error.code,
      ...(error.details !== undefined ? { details: error.details } : {}),
    }),
  ),
}));

vi.mock("@/src/env.mjs", () => ({
  env: {
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "us",
    LANGFUSE_RATE_LIMITS_ENABLED: "true",
  },
}));

vi.mock("@langfuse/shared/src/env", () => ({
  env: {
    REDIS_KEY_PREFIX: undefined,
  },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  redis: null,
  recordIncrement: vi.fn(),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  createNewRedisInstance: vi.fn(),
  redisQueueRetryOptions: {},
  ClickHouseClientManager: {
    getInstance: () => ({
      closeAllConnections: vi.fn(async () => undefined),
    }),
  },
}));

vi.mock(
  "@/src/features/public-api/server/unstable-public-api-error-contract",
  () => ({
    unstablePublicEvalsErrorContract: "unstable-public-evals",
    createUnstablePublicApiRateLimitError:
      mockCreateUnstablePublicApiRateLimitError,
    sendUnstablePublicApiErrorResponse: mockSendUnstablePublicApiErrorResponse,
  }),
);

import { sendRateLimitResponse } from "@/src/features/public-api/server/RateLimitService";

describe("sendRateLimitResponse", () => {
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

  const createResponse = () =>
    createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
    }).res;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a generic structured rate limit error without an upgrade path", () => {
    const res = createResponse();

    sendRateLimitResponse(res, rateLimitResult);

    expect(res.statusCode).toBe(429);
    expect(res._getJSONData()).toEqual({
      message: "Rate limit exceeded",
      code: "rate_limited",
      details: {
        retryAfterSeconds: 3,
        limit: 10,
        remaining: 0,
        resetAt: expect.any(String),
      },
    });
    expect(res.getHeader("Retry-After")).toBe(3);
    expect(res.getHeader("X-RateLimit-Limit")).toBe(10);
    expect(res.getHeader("X-RateLimit-Remaining")).toBe(-1);
    expect(mockCreateUnstablePublicApiRateLimitError).toHaveBeenCalledWith(
      rateLimitResult,
      {},
    );
    expect(mockSendUnstablePublicApiErrorResponse).toHaveBeenCalledTimes(1);
  });

  it("returns upgrade guidance for stable responses with an upgrade path", () => {
    const res = createResponse();

    sendRateLimitResponse(res, rateLimitResult, { upgradePath });

    expect(res.statusCode).toBe(429);
    expect(res.getHeader("Retry-After")).toBe(3);
    expect(res.getHeader("X-RateLimit-Limit")).toBe(10);
    expect(res.getHeader("X-RateLimit-Remaining")).toBe(-1);
    expect(res._getJSONData()).toEqual({
      message:
        "Rate limit exceeded for GET /api/public/traces. Use GET /api/public/v2/observations?fromStartTime=<from>&toStartTime=<to> for high-volume reads.",
      code: "rate_limited",
      details: {
        retryAfterSeconds: 3,
        limit: 10,
        remaining: 0,
        resetAt: expect.any(String),
      },
    });
    expect(mockCreateUnstablePublicApiRateLimitError).toHaveBeenCalledWith(
      rateLimitResult,
      {
        upgradePath,
      },
    );
    expect(mockSendUnstablePublicApiErrorResponse).toHaveBeenCalledTimes(1);
  });

  it("passes the error contract through when an upgrade path is present", () => {
    const res = createResponse();

    sendRateLimitResponse(res, rateLimitResult, {
      errorContract: "unstable-public-evals",
      upgradePath,
    });

    expect(mockCreateUnstablePublicApiRateLimitError).toHaveBeenCalledWith(
      rateLimitResult,
      {
        errorContract: "unstable-public-evals",
        upgradePath,
      },
    );
    expect(mockSendUnstablePublicApiErrorResponse).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(429);
    expect(res._getJSONData()).toEqual({
      message:
        "Rate limit exceeded for GET /api/public/traces. Use GET /api/public/v2/observations?fromStartTime=<from>&toStartTime=<to> for high-volume reads.",
      code: "rate_limited",
      details: {
        retryAfterSeconds: 3,
        limit: 10,
        remaining: 0,
        resetAt: expect.any(String),
      },
    });
  });
});
