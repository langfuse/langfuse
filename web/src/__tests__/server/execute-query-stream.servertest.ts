import { v4 } from "uuid";
import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";
import {
  createOrgProjectAndApiKey,
  createTrace,
  createTracesCh,
  type TraceRecordInsertType,
} from "@langfuse/shared/src/server";
import handler from "../../pages/api/dashboard/execute-query-stream";

// --- Auth mock (only thing we need to mock — no real session in tests) ---

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

function createPostMocks(body: unknown) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: "POST",
    body,
  });
  // node-mocks-http doesn't implement flushHeaders
  res.flushHeaders = vi.fn();
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

  function makeSession(overrides?: {
    admin?: boolean;
    projects?: Array<{ id: string }>;
    v4BetaEnabled?: boolean;
  }) {
    return {
      user: {
        id: "user-1",
        email: "test@example.com",
        admin: overrides?.admin ?? false,
        v4BetaEnabled: overrides?.v4BetaEnabled ?? true,
        organizations: [
          {
            id: orgId,
            projects: overrides?.projects ?? [{ id: projectId }],
          },
        ],
      },
    };
  }

  function makeBody(queryOverrides?: Record<string, unknown>) {
    return {
      projectId,
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

  it("should return 404 when admin accesses non-existent project", async () => {
    mockGetServerAuthSession.mockResolvedValue(
      makeSession({ admin: true, projects: [] }),
    );
    const { req, res } = createPostMocks({
      ...makeBody(),
      projectId: v4(), // random non-existent project
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(JSON.parse(res._getData())).toMatchObject({
      message: "Project not found",
    });
  });

  it("should allow admin access to project they are not a member of and send webhook", async () => {
    mockGetServerAuthSession.mockResolvedValue(
      makeSession({ admin: true, projects: [] }),
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
