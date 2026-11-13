import { EventEmitter } from "node:events";
import { v4 } from "uuid";
import { createMocks, type Body } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";
import {
  createOrgProjectAndApiKey,
  createTrace,
  createTracesCh,
  type TraceRecordInsertType,
} from "@langfuse/shared/src/server";
import type * as QueryServer from "@langfuse/shared/query/server";
import type * as SharedServer from "@langfuse/shared/src/server";
import handler from "../../pages/api/dashboard/execute-query-stream";

const { mockPrepareExecuteQuery, mockQueryClickhouseWithProgress } = vi.hoisted(
  () => ({
    mockPrepareExecuteQuery: vi.fn(),
    mockQueryClickhouseWithProgress: vi.fn(),
  }),
);

vi.mock("@langfuse/shared/query/server", async (importOriginal) => {
  const actual = await importOriginal<typeof QueryServer>();
  mockPrepareExecuteQuery.mockImplementation(actual.prepareExecuteQuery);
  return {
    ...actual,
    prepareExecuteQuery: mockPrepareExecuteQuery,
  };
});

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedServer>();
  mockQueryClickhouseWithProgress.mockImplementation(
    actual.queryClickhouseWithProgress,
  );
  return {
    ...actual,
    queryClickhouseWithProgress: mockQueryClickhouseWithProgress,
  };
});

// --- Auth mock ---

const mockGetServerAuthSession = vi.fn();
vi.mock("../../server/auth", () => ({
  getServerAuthSession: (...args: unknown[]) =>
    mockGetServerAuthSession(...args),
}));

// Admin webhook — not relevant to streaming logic, just suppress side-effects
const mockSendAdminAccessWebhook = vi.fn();
vi.mock("../../server/adminAccessWebhook", () => ({
  sendAdminAccessWebhook: (...args: unknown[]) =>
    mockSendAdminAccessWebhook(...args),
}));

// --- Helpers ---

function createPostMocks(body: unknown, useRealEventEmitter = false) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>(
    {
      method: "POST",
      body: body as Body,
    },
    useRealEventEmitter ? { eventEmitter: EventEmitter } : undefined,
  );
  // node-mocks-http doesn't implement flushHeaders
  res.flushHeaders = vi.fn();
  // node-mocks-http's write() omits the writable backpressure return value.
  const originalWrite = res.write.bind(res);
  res.write = ((chunk: string | Uint8Array) => {
    originalWrite(chunk);
    return true;
  }) as typeof res.write;
  return { req, res };
}

function parseSSEEvents(raw: string): Array<{ event: string; data: string }> {
  return raw
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const eventMatch = block.match(/^event: (.+)$/m);
      const dataMatch = block.match(/^data: (.+)$/m);
      return {
        event: eventMatch?.[1] ?? "",
        data: dataMatch?.[1] ?? "",
      };
    });
}

// --- Test setup ---

describe("execute-query-stream handler", () => {
  let projectId: string;
  let orgId: string;
  let fromTimestamp: string;
  let toTimestamp: string;

  beforeAll(async () => {
    const org = await createOrgProjectAndApiKey();
    projectId = org.projectId;
    orgId = org.orgId;

    const baseTime = new Date("2024-06-15T12:00:00Z").getTime();
    const TRACE_COUNT = 5;

    const traces: TraceRecordInsertType[] = [];
    for (let i = 0; i < TRACE_COUNT; i++) {
      traces.push(
        createTrace({
          id: v4(),
          project_id: projectId,
          name: `test-trace-${i}`,
          timestamp: baseTime + i * 60_000,
          environment: "default",
          tags: [],
          metadata: {},
          created_at: baseTime + i * 60_000,
          updated_at: baseTime + i * 60_000,
          event_ts: baseTime + i * 60_000,
        }),
      );
    }

    await createTracesCh(traces);

    fromTimestamp = new Date(baseTime - 60 * 60 * 1000).toISOString();
    toTimestamp = new Date(baseTime + 60 * 60 * 1000).toISOString();
  });

  beforeEach(() => {
    mockSendAdminAccessWebhook.mockClear();
  });

  function makeSession(overrides?: {
    supportAccess?: boolean;
    projects?: Array<{ id: string }>;
    v4BetaEnabled?: boolean;
  }) {
    return {
      user: {
        id: "user-1",
        email: "test@example.com",
        v4BetaEnabled: overrides?.v4BetaEnabled ?? true,
        organizations: [
          {
            id: orgId,
            supportAccess: overrides?.supportAccess ?? false,
            projects: overrides?.projects ?? [{ id: projectId }],
          },
        ],
      },
    };
  }

  function makeBody(queryOverrides?: Record<string, unknown>) {
    return {
      projectId,
      // The suite's fixture data lives in the v3 traces table.
      version: "v1" as const,
      query: {
        view: "traces" as const,
        dimensions: [],
        metrics: [{ measure: "count", aggregation: "count" }],
        filters: [],
        timeDimension: null,
        fromTimestamp,
        toTimestamp,
        orderBy: null,
        ...queryOverrides,
      },
    };
  }

  it("should return 400 when version is missing (no implicit default)", async () => {
    mockGetServerAuthSession.mockResolvedValue(makeSession());
    const { version: _version, ...bodyWithoutVersion } = makeBody();
    const { req, res } = createPostMocks(bodyWithoutVersion);
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it("should return 400 when v4 beta is disabled", async () => {
    mockGetServerAuthSession.mockResolvedValue(
      makeSession({ v4BetaEnabled: false }),
    );
    const { req, res } = createPostMocks(makeBody());

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toMatchObject({
      message: "Streaming is only supported for v4-enabled dashboard queries",
    });
  });

  // --- Auth tests (mocks are appropriate here) ---

  it("should return 405 for non-POST requests", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });

  it("should return 401 when no session", async () => {
    mockGetServerAuthSession.mockResolvedValue(null);
    const { req, res } = createPostMocks(makeBody());

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(JSON.parse(res._getData())).toMatchObject({
      message: "Unauthorized",
    });
  });

  it("should return 403 when user is not a project member", async () => {
    mockGetServerAuthSession.mockResolvedValue(
      makeSession({ projects: [{ id: "other-project" }] }),
    );
    const { req, res } = createPostMocks(makeBody());

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData())).toMatchObject({
      message: "Not a member of this project",
    });
  });

  it("should return 400 for invalid input", async () => {
    mockGetServerAuthSession.mockResolvedValue(makeSession());
    const { req, res } = createPostMocks({ projectId: 123 });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toMatchObject({
      message: "Invalid input",
    });
  });

  it("should send the admin access webhook when access comes from a support access grant", async () => {
    mockGetServerAuthSession.mockResolvedValue(
      makeSession({ supportAccess: true }),
    );
    const { req, res } = createPostMocks(makeBody());

    await handler(req, res);

    expect(mockSendAdminAccessWebhook).toHaveBeenCalledWith({
      email: "test@example.com",
      projectId,
      orgId,
    });
    // Should still stream data successfully
    const events = parseSSEEvents(res._getData());
    expect(events.some((e) => e.event === "done")).toBe(true);
  });

  it("should not send the admin access webhook for regular members", async () => {
    mockGetServerAuthSession.mockResolvedValue(makeSession());
    const { req, res } = createPostMocks(makeBody());

    await handler(req, res);

    expect(mockSendAdminAccessWebhook).not.toHaveBeenCalled();
    const events = parseSSEEvents(res._getData());
    expect(events.some((e) => e.event === "done")).toBe(true);
  });

  // --- Integration tests (real ClickHouse) ---

  it("should stream real trace count from ClickHouse and end with done", async () => {
    mockGetServerAuthSession.mockResolvedValue(makeSession());
    const { req, res } = createPostMocks(makeBody());

    await handler(req, res);

    const events = parseSSEEvents(res._getData());

    const rowEvents = events.filter((e) => e.event === "row");
    expect(rowEvents.length).toBeGreaterThanOrEqual(1);

    // The count query returns count_count (measure_aggregation naming)
    const firstRow = JSON.parse(rowEvents[0].data);
    expect(Number(firstRow.count_count)).toBe(5);

    const doneEvents = events.filter((e) => e.event === "done");
    expect(doneEvents).toHaveLength(1);
  });

  it("should stream rows with dimension grouping", async () => {
    mockGetServerAuthSession.mockResolvedValue(makeSession());
    const { req, res } = createPostMocks(
      makeBody({
        dimensions: [{ field: "name" }],
        orderBy: null,
      }),
    );

    await handler(req, res);

    const events = parseSSEEvents(res._getData());
    const rowEvents = events.filter((e) => e.event === "row");

    // 5 distinct trace names (test-trace-0 through test-trace-4)
    expect(rowEvents).toHaveLength(5);

    const rows = rowEvents.map((e) => JSON.parse(e.data));
    for (const row of rows) {
      expect(row).toHaveProperty("name");
      expect(row).toHaveProperty("count_count");
      expect(Number(row.count_count)).toBe(1);
    }

    expect(events.some((e) => e.event === "done")).toBe(true);
  });

  it("should return empty result for non-matching time range", async () => {
    mockGetServerAuthSession.mockResolvedValue(makeSession());
    const { req, res } = createPostMocks(
      makeBody({
        fromTimestamp: "2020-01-01T00:00:00.000Z",
        toTimestamp: "2020-01-02T00:00:00.000Z",
      }),
    );

    await handler(req, res);

    const events = parseSSEEvents(res._getData());
    const rowEvents = events.filter((e) => e.event === "row");

    // Should get one row with count = 0 (aggregate with no matching data)
    expect(rowEvents.length).toBeLessThanOrEqual(1);
    if (rowEvents.length === 1) {
      expect(Number(JSON.parse(rowEvents[0].data).count_count)).toBe(0);
    }

    expect(events.some((e) => e.event === "done")).toBe(true);
  });
});

describe("execute-query-stream backpressure", () => {
  const projectId = "backpressure-project";
  const session = {
    user: {
      id: "user-1",
      email: "test@example.com",
      v4BetaEnabled: true,
      organizations: [
        {
          id: "backpressure-org",
          supportAccess: false,
          projects: [{ id: projectId }],
        },
      ],
    },
  };
  const body = {
    projectId,
    version: "v1" as const,
    query: {
      view: "traces" as const,
      dimensions: [],
      metrics: [{ measure: "count" as const, aggregation: "count" as const }],
      filters: [],
      timeDimension: null,
      fromTimestamp: "2024-06-14T12:00:00.000Z",
      toTimestamp: "2024-06-16T12:00:00.000Z",
      orderBy: null,
    },
  };

  beforeEach(() => {
    mockGetServerAuthSession.mockResolvedValue(session);
    mockPrepareExecuteQuery.mockImplementationOnce(async () => ({
      compiledQuery: "SELECT 1",
      parameters: {},
      preferredClickhouseService: undefined,
      tags: { projectId },
      clickhouseSettings: {},
      usesTraceTable: false,
      fromTimestamp: "2024-06-14T12:00:00.000Z",
    }));
  });

  it("waits for drain before consuming the next SSE event", async () => {
    let firstWriteSeen!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      firstWriteSeen = resolve;
    });
    let generatorClosed = false;
    const events: string[] = [];
    const fakeEvents = async function* () {
      try {
        yield { row: { count_count: 1 } };
        yield { row: { count_count: 2 } };
      } finally {
        generatorClosed = true;
      }
    };
    mockQueryClickhouseWithProgress.mockImplementationOnce(() => fakeEvents());

    const { req, res } = createPostMocks(body, true);
    const originalWrite = res.write.bind(res);
    vi.spyOn(res, "write").mockImplementation((chunk: string | Uint8Array) => {
      events.push(String(chunk));
      originalWrite(chunk);
      if (events.length === 1) {
        firstWriteSeen();
        return false;
      }
      return true;
    });

    const handlerPromise = handler(req, res);
    await firstWrite;
    await new Promise((resolve) => setImmediate(resolve));

    expect(events).toHaveLength(1);
    expect(generatorClosed).toBe(false);

    res.emit("drain");
    await handlerPromise;

    expect(
      events.filter((event) => event.startsWith("event: row")),
    ).toHaveLength(2);
    expect(events.at(-1)).toMatch(/^event: done/);
    expect(generatorClosed).toBe(true);
  });

  it("stops and cleans up when the client closes while waiting for drain", async () => {
    let firstWriteSeen!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      firstWriteSeen = resolve;
    });
    let generatorClosed = false;
    const events: string[] = [];
    const fakeEvents = async function* () {
      try {
        yield { row: { count_count: 1 } };
        yield { row: { count_count: 2 } };
      } finally {
        generatorClosed = true;
      }
    };
    mockQueryClickhouseWithProgress.mockImplementationOnce(() => fakeEvents());

    const { req, res } = createPostMocks(body, true);
    const originalWrite = res.write.bind(res);
    vi.spyOn(res, "write").mockImplementation((chunk: string | Uint8Array) => {
      events.push(String(chunk));
      originalWrite(chunk);
      if (events.length === 1) {
        firstWriteSeen();
        return false;
      }
      return true;
    });

    const handlerPromise = handler(req, res);
    await firstWrite;
    res.emit("close");
    await handlerPromise;

    expect(events).toHaveLength(1);
    expect(generatorClosed).toBe(true);
  });

  it("sends actionable advice for an oversized ClickHouse result", async () => {
    const fakeEvents = async function* () {
      yield { row: { count_count: 1 } };
      yield {
        exception:
          "Code: 158. DB::Exception: Limit for result exceeded, max bytes: 10.00 MiB. (TOO_MANY_ROWS_OR_BYTES)",
      };
    };
    mockQueryClickhouseWithProgress.mockImplementationOnce(() => fakeEvents());

    const { req, res } = createPostMocks(body);
    await handler(req, res);

    const events = parseSSEEvents(res._getData());
    const errorEvent = events.find((event) => event.event === "error");
    expect(errorEvent).toBeDefined();
    expect(JSON.parse(errorEvent!.data).message).toMatch(
      /result is too large.*shorter date range.*specific filters/i,
    );
    expect(events.some((event) => event.event === "done")).toBe(false);
  });
});
