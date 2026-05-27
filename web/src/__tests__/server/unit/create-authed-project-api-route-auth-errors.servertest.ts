import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { z } from "zod";

const {
  mockVerifyAuthHeaderAndReturnScope,
  mockIsPrismaException,
  mockRateLimitRequest,
} = vi.hoisted(() => ({
  mockVerifyAuthHeaderAndReturnScope: vi.fn(),
  mockIsPrismaException: vi.fn(),
  mockRateLimitRequest: vi.fn(),
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
  traceException: vi.fn(),
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
    createUnstablePublicApiAuthError: vi.fn(),
    createUnstablePublicApiRequestValidationError: vi.fn(),
    sendUnstablePublicApiErrorResponse: vi.fn(),
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

  async function callRoute() {
    const handler = createAuthedProjectAPIRoute({
      name: "Test Route",
      querySchema: z.object({}),
      responseSchema: z.object({ ok: z.literal(true) }),
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
  });
});
