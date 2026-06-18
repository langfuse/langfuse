import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { z } from "zod";

const {
  mockVerifyAuthHeaderAndReturnScope,
  mockIsPrismaException,
  mockRateLimitRequest,
  mockTraceException,
  mockCreateUnstablePublicApiAuthError,
  mockSendUnstablePublicApiErrorResponse,
} = vi.hoisted(() => ({
  mockVerifyAuthHeaderAndReturnScope: vi.fn(),
  mockIsPrismaException: vi.fn(),
  mockRateLimitRequest: vi.fn(),
  mockTraceException: vi.fn(),
  mockCreateUnstablePublicApiAuthError: vi.fn((value) => value),
  mockSendUnstablePublicApiErrorResponse: vi.fn(),
}));

vi.mock("@/src/features/public-api/server/apiAuth", () => ({
  ApiAuthService: class {
    verifyAuthHeaderAndReturnScope = mockVerifyAuthHeaderAndReturnScope;
  },
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {},
}));

vi.mock("@langfuse/shared/src/server", () => ({
  redis: null,
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  traceException: mockTraceException,
  contextWithLangfuseProps: vi.fn(() => ({})),
  ClickHouseClientManager: {
    getInstance: () => ({
      closeAllConnections: vi.fn(async () => undefined),
    }),
  },
}));

vi.mock("@/src/features/public-api/server/RateLimitService", () => ({
  RateLimitService: {
    getInstance: () => ({
      rateLimitRequest: mockRateLimitRequest,
    }),
  },
}));

vi.mock("@/src/features/public-api/server/withMiddlewares", () => ({
  isZodError: vi.fn(() => false),
}));

vi.mock(
  "@/src/features/public-api/server/unstable-public-api-error-contract",
  () => ({
    unstablePublicEvalsErrorContract: "unstable-public-evals",
    createUnstablePublicApiAuthError: mockCreateUnstablePublicApiAuthError,
    createUnstablePublicApiRequestValidationError: vi.fn(),
    sendUnstablePublicApiErrorResponse: mockSendUnstablePublicApiErrorResponse,
  }),
);

vi.mock("@/src/env.mjs", () => ({
  env: {
    NODE_ENV: "test",
  },
}));

vi.mock("@opentelemetry/api", () => ({
  context: {
    with: vi.fn(async (_ctx, fn) => await fn()),
  },
}));

vi.mock("@/src/utils/exceptions", () => ({
  isPrismaException: mockIsPrismaException,
}));

import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";

describe("createAuthedProjectAPIRoute auth error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPrismaException.mockReturnValue(false);
    mockRateLimitRequest.mockResolvedValue({
      isRateLimited: () => false,
    });
  });

  async function callRoute(options?: {
    useUnstableErrorContract?: boolean;
    rateLimitExceededMessage?: string;
    rateLimitUpgradePath?: {
      legacyEndpoint: string;
      replacementEndpoint: string;
      docsUrl: string;
      notes?: string[];
    };
  }) {
    const handler = createAuthedProjectAPIRoute({
      name: "Test Route",
      querySchema: z.object({}),
      responseSchema: z.object({ ok: z.literal(true) }),
      errorContract: options?.useUnstableErrorContract
        ? "unstable-public-evals"
        : undefined,
      rateLimitExceededMessage: options?.rateLimitExceededMessage,
      rateLimitUpgradePath: options?.rateLimitUpgradePath,
      fn: async () => ({ ok: true as const }),
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      headers: {
        authorization: "Basic test",
      },
      query: {},
    });

    await handler(req, res);

    return res;
  }

  it("returns 401 for invalid credentials", async () => {
    mockVerifyAuthHeaderAndReturnScope.mockResolvedValueOnce({
      validKey: false,
      error:
        "Invalid credentials. Confirm that you've configured the correct host.",
    });

    const res = await callRoute();

    expect(res.statusCode).toBe(401);
    expect(res._getJSONData()).toEqual({
      message:
        "Invalid credentials. Confirm that you've configured the correct host.",
    });
  });

  it("returns 503 when auth fails with a prisma exception", async () => {
    const prismaLikeError = new Error("Can't reach database server");
    mockVerifyAuthHeaderAndReturnScope.mockRejectedValueOnce(prismaLikeError);
    mockIsPrismaException.mockReturnValue(true);

    const res = await callRoute();

    expect(res.statusCode).toBe(503);
    expect(res._getJSONData()).toEqual({
      message: "Service Unavailable",
    });
    expect(mockTraceException).toHaveBeenCalledWith(prismaLikeError);
  });

  it("returns unstable auth errors and traces prisma auth failures", async () => {
    const prismaLikeError = new Error("Can't reach database server");
    mockVerifyAuthHeaderAndReturnScope.mockRejectedValueOnce(prismaLikeError);
    mockIsPrismaException.mockReturnValue(true);

    await callRoute({ useUnstableErrorContract: true });

    expect(mockTraceException).toHaveBeenCalledWith(prismaLikeError);
    expect(mockCreateUnstablePublicApiAuthError).toHaveBeenCalledWith({
      statusCode: 503,
      message: "Service Unavailable",
    });
    expect(mockSendUnstablePublicApiErrorResponse).toHaveBeenCalledTimes(1);
  });

  it("passes upgrade guidance to rate limit responses", async () => {
    const sendRestResponseIfLimited = vi.fn((res: NextApiResponse) => {
      res.status(429).json({ message: "rate limited" });
    });
    const upgradePath = {
      legacyEndpoint: "GET /api/public/traces",
      replacementEndpoint:
        "GET /api/public/v2/observations?fromStartTime=<from>&toStartTime=<to>",
      docsUrl:
        "https://langfuse.com/docs/api-and-data-platform/features/observations-api",
      notes: ["Group returned rows by traceId to reconstruct trace activity."],
    };

    mockVerifyAuthHeaderAndReturnScope.mockResolvedValueOnce({
      validKey: true,
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
    });
    mockRateLimitRequest.mockResolvedValueOnce({
      isRateLimited: () => true,
      sendRestResponseIfLimited,
    });

    const res = await callRoute({
      rateLimitExceededMessage:
        "Rate limit exceeded for this legacy public API endpoint. Use the v2 Observations API for high-volume reads.",
      rateLimitUpgradePath: upgradePath,
    });

    expect(res.statusCode).toBe(429);
    expect(sendRestResponseIfLimited).toHaveBeenCalledWith(res, {
      errorContract: undefined,
      message:
        "Rate limit exceeded for this legacy public API endpoint. Use the v2 Observations API for high-volume reads.",
      upgradePath,
    });
  });
});
