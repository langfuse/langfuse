import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { LangfuseNotFoundError } from "@langfuse/shared";

const {
  mockLoggerWarn,
  mockLoggerError,
  mockLoggerInfo,
  mockTraceException,
  MockClickHouseResourceError,
} = vi.hoisted(() => ({
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockTraceException: vi.fn(),
  MockClickHouseResourceError: class MockClickHouseResourceError extends (
    Error
  ) {},
}));

vi.mock("@langfuse/shared/src/server", () => ({
  redis: null,
  logger: {
    debug: vi.fn(),
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
  },
  traceException: mockTraceException,
  contextWithLangfuseProps: vi.fn(() => ({})),
  ClickHouseResourceError: MockClickHouseResourceError,
  ClickHouseClientManager: {
    getInstance: () => ({
      closeAllConnections: vi.fn(async () => undefined),
    }),
  },
}));

vi.mock("@/src/utils/exceptions", () => ({
  isPrismaException: vi.fn(() => false),
}));

vi.mock("@/src/features/public-api/server/cors", () => ({
  cors: vi.fn(),
  runMiddleware: vi.fn(async () => undefined),
}));

vi.mock("@/src/features/public-api/server/clickHouseRequestTags", () => ({
  clickHouseRouteForRequest: vi.fn(() => "test-route"),
}));

vi.mock("@opentelemetry/api", () => ({
  context: {
    with: vi.fn(async (_ctx: unknown, fn: () => unknown) => await fn()),
  },
}));

// This test exercises the REAL withMiddlewares and the REAL
// unstable-public-api-error-contract module, so it verifies the actual
// wire-format decision, not a mocked stand-in.
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createUnstablePublicApiError } from "@/src/features/public-api/server/unstable-public-api-error-contract";

describe("withMiddlewares - structured error rendering", () => {
  const createReqRes = () =>
    createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      headers: {},
    });

  it("renders a plain BaseError with the legacy {message, error} shape on a file with no error contract", async () => {
    const { req, res } = createReqRes();

    const handler = withMiddlewares({
      GET: async () => {
        throw new LangfuseNotFoundError("Dataset not found");
      },
    });

    await handler(req, res);

    expect(res.statusCode).toBe(404);
    expect(res._getJSONData()).toEqual({
      message: "Dataset not found",
      error: "LangfuseNotFoundError",
    });
  });

  it("renders an UnstablePublicApiError with the structured {message, code} shape even on a file with no error contract", async () => {
    const { req, res } = createReqRes();

    const handler = withMiddlewares({
      GET: async () => {
        throw createUnstablePublicApiError({
          httpCode: 404,
          code: "resource_not_found",
          message: "Dataset not found",
        });
      },
    });

    await handler(req, res);

    expect(res.statusCode).toBe(404);
    expect(res._getJSONData()).toEqual({
      message: "Dataset not found",
      code: "resource_not_found",
    });
  });

  it("renders an UnstablePublicApiError with details when provided", async () => {
    const { req, res } = createReqRes();

    const handler = withMiddlewares({
      GET: async () => {
        throw createUnstablePublicApiError({
          httpCode: 400,
          code: "schema_validation_failed",
          message: "Schema validation failed for 1 item(s)",
          details: {
            validationErrors: [
              {
                datasetItemId: "item-1",
                field: "input",
                errors: [{ path: "/country", message: "must be enum" }],
              },
            ],
          },
        });
      },
    });

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res._getJSONData()).toEqual({
      message: "Schema validation failed for 1 item(s)",
      code: "schema_validation_failed",
      details: {
        validationErrors: [
          {
            datasetItemId: "item-1",
            field: "input",
            errors: [{ path: "/country", message: "must be enum" }],
          },
        ],
      },
    });
  });
});
