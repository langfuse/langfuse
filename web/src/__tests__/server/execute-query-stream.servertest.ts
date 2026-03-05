/** @jest-environment node */
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { RESOURCE_LIMIT_ERROR_MESSAGE } from "@langfuse/shared";
import { formatSSEEvent } from "../../pages/api/dashboard/execute-query-stream";

// --- Mocks ---
// Note: jest.mock cannot resolve @/ path aliases in this project's test config,
// so we use relative paths for project-internal modules.

const mockGetServerAuthSession = jest.fn();
jest.mock("../../server/auth", () => ({
  getServerAuthSession: (...args: unknown[]) =>
    mockGetServerAuthSession(...args),
}));

const mockSendAdminAccessWebhook = jest.fn();
jest.mock("../../server/adminAccessWebhook", () => ({
  sendAdminAccessWebhook: (...args: unknown[]) =>
    mockSendAdminAccessWebhook(...args),
}));

const mockQueryClickhouseWithProgress = jest.fn();
jest.mock("@langfuse/shared/src/server", () => {
  const actual = jest.requireActual("@langfuse/shared/src/server");
  return {
    __esModule: true,
    ...actual,
    queryClickhouseWithProgress: (...args: unknown[]) =>
      mockQueryClickhouseWithProgress(...args),
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  };
});

const mockPrismaProjectFindFirst = jest.fn();
jest.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    project: {
      findFirst: (...args: unknown[]) => mockPrismaProjectFindFirst(...args),
    },
  },
}));

const mockPrepareExecuteQuery = jest.fn();
const mockToClickhouseQueryOpts = jest.fn();
const mockValidateQuery = jest.fn();
jest.mock("../../features/query/server/queryExecutor", () => ({
  prepareExecuteQuery: (...args: unknown[]) => mockPrepareExecuteQuery(...args),
  toClickhouseQueryOpts: (...args: unknown[]) =>
    mockToClickhouseQueryOpts(...args),
  validateQuery: (...args: unknown[]) => mockValidateQuery(...args),
}));

// Import handler after mocks are set up
import handler from "../../pages/api/dashboard/execute-query-stream";

// --- Helpers ---

const projectId = "test-project-id";
const orgId = "test-org-id";

const validSession = {
  user: {
    id: "user-1",
    email: "test@example.com",
    admin: false,
    organizations: [
      {
        id: orgId,
        projects: [{ id: projectId }],
      },
    ],
  },
};

const validBody = {
  projectId,
  query: {
    view: "traces" as const,
    dimensions: [],
    metrics: [{ measure: "count", aggregation: "count" }],
    filters: [],
    timeDimension: null,
    fromTimestamp: new Date(Date.now() - 3600_000).toISOString(),
    toTimestamp: new Date().toISOString(),
    orderBy: null,
  },
};

function createPostMocks(body: unknown = validBody) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: "POST",
    body,
  });
  // node-mocks-http doesn't implement flushHeaders
  res.flushHeaders = jest.fn();
  return { req, res };
}

async function* fakeProgressStream<T>(
  events: Array<{ progress: object } | { row: T } | { exception: string }>,
) {
  for (const event of events) {
    yield event;
  }
}

describe("execute-query-stream handler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateQuery.mockReturnValue({ valid: true });
    mockPrepareExecuteQuery.mockResolvedValue({
      compiledQuery: "SELECT 1",
      parameters: {},
      tags: {},
      clickhouseSettings: {},
    });
    mockToClickhouseQueryOpts.mockReturnValue({
      query: "SELECT 1",
      params: {},
    });
  });

  // --- Auth tests ---

  it("should return 405 for non-POST requests", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });

  it("should return 401 when no session", async () => {
    mockGetServerAuthSession.mockResolvedValue(null);
    const { req, res } = createPostMocks();

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(JSON.parse(res._getData())).toMatchObject({
      message: "Unauthorized",
    });
  });

  it("should return 403 when user is not a project member", async () => {
    mockGetServerAuthSession.mockResolvedValue({
      user: {
        id: "user-1",
        email: "test@example.com",
        admin: false,
        organizations: [{ id: orgId, projects: [{ id: "other-project" }] }],
      },
    });
    const { req, res } = createPostMocks();

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData())).toMatchObject({
      message: "Not a member of this project",
    });
  });

  it("should return 404 when admin accesses non-existent project", async () => {
    mockGetServerAuthSession.mockResolvedValue({
      user: {
        id: "user-1",
        email: "admin@example.com",
        admin: true,
        organizations: [{ id: orgId, projects: [] }],
      },
    });
    mockPrismaProjectFindFirst.mockResolvedValue(null);
    const { req, res } = createPostMocks();

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
  });

  it("should allow admin access to project they are not a member of and send webhook", async () => {
    mockGetServerAuthSession.mockResolvedValue({
      user: {
        id: "user-1",
        email: "admin@example.com",
        admin: true,
        organizations: [{ id: orgId, projects: [] }],
      },
    });
    mockPrismaProjectFindFirst.mockResolvedValue({ orgId });
    mockQueryClickhouseWithProgress.mockReturnValue(fakeProgressStream([]));
    const { req, res } = createPostMocks();

    await handler(req, res);

    expect(mockSendAdminAccessWebhook).toHaveBeenCalledWith({
      email: "admin@example.com",
      projectId,
      orgId,
    });
  });

  // --- Input validation ---

  it("should return 400 for invalid input", async () => {
    mockGetServerAuthSession.mockResolvedValue(validSession);
    const { req, res } = createPostMocks({ projectId: 123 });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toMatchObject({
      message: "Invalid input",
    });
  });

  it("should return 400 for invalid query", async () => {
    mockGetServerAuthSession.mockResolvedValue(validSession);
    mockValidateQuery.mockReturnValue({
      valid: false,
      reason: "bad metric",
    });
    const { req, res } = createPostMocks();

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toMatchObject({
      message: "Invalid query",
    });
  });

  // --- SSE streaming ---

  it("should stream row events and end with done", async () => {
    mockGetServerAuthSession.mockResolvedValue(validSession);
    mockQueryClickhouseWithProgress.mockReturnValue(
      fakeProgressStream([{ row: { count: 42 } }, { row: { count: 99 } }]),
    );
    const { req, res } = createPostMocks();

    await handler(req, res);

    const written = res._getData();
    expect(written).toContain('event: row\ndata: {"count":42}\n\n');
    expect(written).toContain('event: row\ndata: {"count":99}\n\n');
    expect(written).toContain("event: done\ndata: {}\n\n");
  });

  it("should stream progress events", async () => {
    mockGetServerAuthSession.mockResolvedValue(validSession);
    mockQueryClickhouseWithProgress.mockReturnValue(
      fakeProgressStream([
        {
          progress: { read_rows: "100", read_bytes: "1000", elapsed_ns: "500" },
        },
        { row: { count: 1 } },
      ]),
    );
    const { req, res } = createPostMocks();

    await handler(req, res);

    const written = res._getData();
    expect(written).toContain("event: progress\n");
    expect(written).toContain("event: row\n");
    expect(written).toContain("event: done\n");
  });

  it("should send user-friendly error for resource limit exceptions", async () => {
    mockGetServerAuthSession.mockResolvedValue(validSession);
    mockQueryClickhouseWithProgress.mockReturnValue(
      fakeProgressStream([
        { exception: "Code: 241. DB::Exception: memory limit exceeded" },
      ]),
    );
    const { req, res } = createPostMocks();

    await handler(req, res);

    const written = res._getData();
    expect(written).toContain(`event: error\n`);
    expect(written).toContain(RESOURCE_LIMIT_ERROR_MESSAGE);
    expect(written).not.toContain("event: done");
  });

  it("should pass through non-resource exception messages", async () => {
    mockGetServerAuthSession.mockResolvedValue(validSession);
    mockQueryClickhouseWithProgress.mockReturnValue(
      fakeProgressStream([{ exception: "Some other ClickHouse error" }]),
    );
    const { req, res } = createPostMocks();

    await handler(req, res);

    const written = res._getData();
    expect(written).toContain("Some other ClickHouse error");
  });

  it("should handle thrown errors gracefully", async () => {
    mockGetServerAuthSession.mockResolvedValue(validSession);
    mockPrepareExecuteQuery.mockRejectedValue(new Error("Compilation failed"));
    const { req, res } = createPostMocks();

    await handler(req, res);

    const written = res._getData();
    expect(written).toContain("event: error\n");
    expect(written).toContain("Compilation failed");
  });
});

describe("formatSSEEvent", () => {
  it("should format progress events", () => {
    const result = formatSSEEvent({
      type: "progress",
      progress: { read_rows: "50" },
    });
    expect(result).toBe('event: progress\ndata: {"read_rows":"50"}\n\n');
  });

  it("should format row events", () => {
    const result = formatSSEEvent({ type: "row", row: { count: 42 } });
    expect(result).toBe('event: row\ndata: {"count":42}\n\n');
  });

  it("should format done events", () => {
    const result = formatSSEEvent({ type: "done" });
    expect(result).toBe("event: done\ndata: {}\n\n");
  });

  it("should format error events with JSON message", () => {
    const result = formatSSEEvent({
      type: "error",
      message: "Query timed out",
    });
    expect(result).toBe(
      'event: error\ndata: {"message":"Query timed out"}\n\n',
    );
  });
});
