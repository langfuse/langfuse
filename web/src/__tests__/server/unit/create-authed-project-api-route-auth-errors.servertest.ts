import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { z } from "zod";
import type * as PrismaClientModule from "@prisma/client";

const {
  mockVerifyAuthHeaderAndReturnScope,
  mockIsPrismaException,
  mockRateLimitRequest,
  mockTraceException,
  mockLoggerDebug,
  mockLoggerInfo,
  mockRecordIncrement,
  mockFindOrganization,
  mockCreateStructuredPublicApiAuthError,
  mockSendStructuredPublicApiErrorResponse,
  mockEnv,
} = vi.hoisted(() => ({
  mockVerifyAuthHeaderAndReturnScope: vi.fn(),
  mockIsPrismaException: vi.fn(),
  mockRateLimitRequest: vi.fn(),
  mockTraceException: vi.fn(),
  mockLoggerDebug: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockRecordIncrement: vi.fn(),
  mockFindOrganization: vi.fn(),
  mockCreateStructuredPublicApiAuthError: vi.fn((value) => value),
  mockSendStructuredPublicApiErrorResponse: vi.fn(),
  mockEnv: {
    NODE_ENV: "test",
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined as string | undefined,
    LANGFUSE_LEGACY_GET_API_NEW_ORG_CUTOFF_ENABLED: "false" as
      | "true"
      | "false",
  },
}));

vi.mock("@/src/features/public-api/server/apiAuth", () => ({
  ApiAuthService: class {
    verifyAuthHeaderAndReturnScope = mockVerifyAuthHeaderAndReturnScope;
  },
}));

vi.mock("@langfuse/shared/src/db", async () => {
  const { GatewayConnectionStatus, GatewayIngestionMode, GatewayProvider } =
    await vi.importActual<typeof PrismaClientModule>("@prisma/client");
  return {
    GatewayConnectionStatus,
    GatewayIngestionMode,
    GatewayProvider,
    prisma: {
      organization: {
        findUnique: mockFindOrganization,
      },
    },
  };
});

vi.mock("@langfuse/shared/src/server", () => ({
  redis: null,
  logger: {
    debug: mockLoggerDebug,
    info: mockLoggerInfo,
    warn: vi.fn(),
    error: vi.fn(),
  },
  recordIncrement: mockRecordIncrement,
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
  "@/src/features/public-api/server/structuredPublicApiErrorContract",
  () => ({
    structuredPublicApiErrorContract: "structured",
    createStructuredPublicApiAuthError: mockCreateStructuredPublicApiAuthError,
    createStructuredPublicApiRequestValidationError: vi.fn(),
    sendStructuredPublicApiErrorResponse:
      mockSendStructuredPublicApiErrorResponse,
  }),
);

vi.mock("@/src/env.mjs", () => ({ env: mockEnv }));

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
  const deprecation = {
    message: "This endpoint is deprecated. Use the replacement.",
    replacement: "GET /api/public/v2/observations",
    docsUrl:
      "https://langfuse.com/docs/api-and-data-platform/features/observations-api",
    sunsetAt: "2026-11-16",
  };
  const validAuth = {
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
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPrismaException.mockReturnValue(false);
    mockRateLimitRequest.mockResolvedValue({
      isRateLimited: () => false,
    });
    mockEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    mockEnv.LANGFUSE_LEGACY_GET_API_NEW_ORG_CUTOFF_ENABLED = "false";
  });

  async function callRoute(options?: {
    useStructuredErrorContract?: boolean;
    rateLimitUpgradePath?: {
      legacyEndpoint: string;
      replacementEndpoint: string;
      docsUrl: string;
    };
    mockResponseSerializationError?: boolean;
    deprecation?: typeof deprecation;
    method?: "GET" | "POST";
  }) {
    const handler = createAuthedProjectAPIRoute({
      name: "Test Route",
      action: "project:read",
      querySchema: z.object({}),
      responseSchema: z.object({ ok: z.literal(true) }),
      errorContract: options?.useStructuredErrorContract
        ? "structured"
        : undefined,
      rateLimitUpgradePath: options?.rateLimitUpgradePath,
      deprecation: options?.deprecation,
      fn: async () => ({ ok: true as const }),
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: options?.method ?? "GET",
      url: "/api/public/test",
      headers: {
        authorization: "Basic test",
      },
      query: {},
    });

    if (options?.mockResponseSerializationError) {
      const writeJson = res.json.bind(res);
      vi.spyOn(res, "json")
        .mockImplementationOnce(() => {
          throw new RangeError("Invalid string length");
        })
        .mockImplementation((body) => writeJson(body));
    }

    await handler(req, res);

    return res;
  }

  it("rejects deprecated GET routes with actionable guidance and scoped telemetry", async () => {
    mockEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "US";
    mockEnv.LANGFUSE_LEGACY_GET_API_NEW_ORG_CUTOFF_ENABLED = "true";
    mockVerifyAuthHeaderAndReturnScope.mockResolvedValueOnce(validAuth);
    mockFindOrganization.mockResolvedValueOnce({
      createdAt: new Date("2026-09-16T00:00:00.000Z"),
    });

    const res = await callRoute({ deprecation });

    expect(res.statusCode).toBe(410);
    expect(res._getJSONData()).toEqual({
      error: "LEGACY_API_UNAVAILABLE_FOR_NEW_ORGANIZATION",
      message:
        "GET /api/public/test is a legacy API that is not available to organizations created on or after September 16, 2026. Migrate this request to GET /api/public/v2/observations. See the migration documentation at https://langfuse.com/docs/api-and-data-platform/features/observations-api.",
      requestedEndpoint: "GET /api/public/test",
      replacementEndpoint: "GET /api/public/v2/observations",
      documentationUrl:
        "https://langfuse.com/docs/api-and-data-platform/features/observations-api",
      _deprecation: deprecation,
    });
    expect(mockRateLimitRequest).toHaveBeenCalledOnce();
    expect(mockRecordIncrement).toHaveBeenCalledWith(
      "langfuse.public_api.legacy_get_rejected",
      1,
      {
        orgId: "org-1",
        projectId: "project-1",
        apiRoute: "Test Route",
      },
    );
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "Rejected legacy GET API request for organization created at or after cutoff",
      {
        orgId: "org-1",
        projectId: "project-1",
        apiRoute: "Test Route",
        apiPath: "GET /api/public/test",
        organizationCreatedAt: "2026-09-16T00:00:00.000Z",
        cutoff: "2026-09-16T00:00:00.000Z",
      },
    );
  });

  it("keeps deprecated GET routes available when the cutoff is disabled", async () => {
    mockEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "US";
    mockVerifyAuthHeaderAndReturnScope.mockResolvedValueOnce(validAuth);

    const res = await callRoute({ deprecation });

    expect(res.statusCode).toBe(200);
    expect(mockFindOrganization).not.toHaveBeenCalled();
    expect(mockRecordIncrement).not.toHaveBeenCalled();
    expect(mockLoggerInfo).not.toHaveBeenCalled();
  });

  it("keeps deprecated GET routes available to older Cloud organizations", async () => {
    mockEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "US";
    mockEnv.LANGFUSE_LEGACY_GET_API_NEW_ORG_CUTOFF_ENABLED = "true";
    mockVerifyAuthHeaderAndReturnScope.mockResolvedValueOnce(validAuth);
    mockFindOrganization.mockResolvedValueOnce({
      createdAt: new Date("2026-09-15T23:59:59.999Z"),
    });

    const res = await callRoute({ deprecation });

    expect(res.statusCode).toBe(200);
    expect(res._getJSONData()).toEqual({
      ok: true,
      _deprecation: deprecation,
    });
  });

  it("does not apply the organization cutoff outside Langfuse Cloud", async () => {
    mockEnv.LANGFUSE_LEGACY_GET_API_NEW_ORG_CUTOFF_ENABLED = "true";
    mockVerifyAuthHeaderAndReturnScope.mockResolvedValueOnce(validAuth);

    const res = await callRoute({ deprecation });

    expect(res.statusCode).toBe(200);
    expect(mockFindOrganization).not.toHaveBeenCalled();
  });

  it("does not apply the organization cutoff to current GET routes", async () => {
    mockEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "US";
    mockEnv.LANGFUSE_LEGACY_GET_API_NEW_ORG_CUTOFF_ENABLED = "true";
    mockVerifyAuthHeaderAndReturnScope.mockResolvedValueOnce(validAuth);

    const res = await callRoute();

    expect(res.statusCode).toBe(200);
    expect(mockFindOrganization).not.toHaveBeenCalled();
  });

  it("does not apply the organization cutoff to deprecated write routes", async () => {
    mockEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "US";
    mockEnv.LANGFUSE_LEGACY_GET_API_NEW_ORG_CUTOFF_ENABLED = "true";
    mockVerifyAuthHeaderAndReturnScope.mockResolvedValueOnce(validAuth);

    const res = await callRoute({ deprecation, method: "POST" });

    expect(res.statusCode).toBe(200);
    expect(mockFindOrganization).not.toHaveBeenCalled();
  });

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

  it("returns structured authentication errors", async () => {
    mockVerifyAuthHeaderAndReturnScope.mockResolvedValueOnce({
      validKey: false,
      error: "Invalid credentials",
    });

    await callRoute({ useStructuredErrorContract: true });

    expect(mockCreateStructuredPublicApiAuthError).toHaveBeenCalledWith({
      statusCode: 401,
      message: "Invalid credentials",
    });
    expect(mockSendStructuredPublicApiErrorResponse).toHaveBeenCalledTimes(1);
  });

  it("returns structured errors and traces prisma auth failures", async () => {
    const prismaLikeError = new Error("Can't reach database server");
    mockVerifyAuthHeaderAndReturnScope.mockRejectedValueOnce(prismaLikeError);
    mockIsPrismaException.mockReturnValue(true);

    await callRoute({ useStructuredErrorContract: true });

    expect(mockTraceException).toHaveBeenCalledWith(prismaLikeError);
    expect(mockCreateStructuredPublicApiAuthError).toHaveBeenCalledWith({
      statusCode: 503,
      message: "Service Unavailable",
    });
    expect(mockSendStructuredPublicApiErrorResponse).toHaveBeenCalledTimes(1);
  });

  it("keeps the shared rate limit response for routes without upgrade guidance", async () => {
    const sendRestResponseIfLimited = vi.fn((res: NextApiResponse) => {
      res.status(429).json({ message: "rate limited" });
    });

    mockVerifyAuthHeaderAndReturnScope.mockResolvedValueOnce(validAuth);
    mockRateLimitRequest.mockResolvedValueOnce({
      isRateLimited: () => true,
      sendRestResponseIfLimited,
    });

    const res = await callRoute();

    expect(res.statusCode).toBe(429);
    expect(sendRestResponseIfLimited).toHaveBeenCalledWith(res, {
      errorContract: undefined,
      upgradePath: undefined,
    });
  });

  it("rate limits deprecated GET routes before loading the organization", async () => {
    const sendRestResponseIfLimited = vi.fn((res: NextApiResponse) => {
      res.status(429).json({ message: "rate limited" });
    });

    mockEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "US";
    mockEnv.LANGFUSE_LEGACY_GET_API_NEW_ORG_CUTOFF_ENABLED = "true";
    mockVerifyAuthHeaderAndReturnScope.mockResolvedValueOnce(validAuth);
    mockRateLimitRequest.mockResolvedValueOnce({
      isRateLimited: () => true,
      sendRestResponseIfLimited,
    });

    const res = await callRoute({ deprecation });

    expect(res.statusCode).toBe(429);
    expect(mockFindOrganization).not.toHaveBeenCalled();
  });

  it("passes upgrade guidance to the shared rate limit response", async () => {
    const sendRestResponseIfLimited = vi.fn((res: NextApiResponse) => {
      res.status(429).json({ message: "rate limited" });
    });
    const upgradePath = {
      legacyEndpoint: "GET /api/public/traces",
      replacementEndpoint:
        "GET /api/public/v2/observations?fromStartTime=<from>&toStartTime=<to>",
      docsUrl:
        "https://langfuse.com/docs/api-and-data-platform/features/observations-api",
    };

    mockVerifyAuthHeaderAndReturnScope.mockResolvedValueOnce(validAuth);
    mockRateLimitRequest.mockResolvedValueOnce({
      isRateLimited: () => true,
      sendRestResponseIfLimited,
    });

    const res = await callRoute({
      rateLimitUpgradePath: upgradePath,
    });

    expect(res.statusCode).toBe(429);
    expect(sendRestResponseIfLimited).toHaveBeenCalledWith(res, {
      errorContract: undefined,
      upgradePath,
    });
  });

  it("does not include request query or body data in debug logs", async () => {
    mockVerifyAuthHeaderAndReturnScope.mockResolvedValueOnce(validAuth);

    const handler = createAuthedProjectAPIRoute({
      name: "Sensitive Route",
      action: "project:read",
      querySchema: z.object({ token: z.string() }),
      bodySchema: z.object({
        secretKey: z.string(),
        extraHeaders: z.record(z.string(), z.string()),
      }),
      responseSchema: z.object({ ok: z.literal(true) }),
      fn: async () => ({ ok: true as const }),
    });
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "PUT",
      headers: {
        authorization: "Basic test",
      },
      query: {
        token: "SENTINEL_QUERY_TOKEN",
      },
      body: {
        secretKey: "SENTINEL_SECRET_KEY",
        extraHeaders: {
          Authorization: "Bearer SENTINEL_HEADER_TOKEN",
        },
      },
    });

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockLoggerDebug).toHaveBeenCalledExactlyOnceWith(
      "Request to route Sensitive Route projectId project-1",
    );
  });

  it("throws a 422 payload error when response serialization exceeds V8 string limits", async () => {
    mockVerifyAuthHeaderAndReturnScope.mockResolvedValueOnce(validAuth);

    await expect(
      callRoute({ mockResponseSerializationError: true }),
    ).rejects.toMatchObject({
      name: "PayloadTooLargeError",
      httpCode: 422,
      message: "Response payload is too large",
    });
  });
});
