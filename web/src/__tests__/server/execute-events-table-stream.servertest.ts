/** @jest-environment node */
import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";
import superjson from "superjson";

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
const mockBuildObservationsFromEventsTableQuery = jest.fn();
const mockHydrateObservationsWithModelDataFromEventsTableRows = jest.fn();

jest.mock("@langfuse/shared/src/server", () => {
  const actual = jest.requireActual("@langfuse/shared/src/server");
  return {
    ...actual,
    queryClickhouseWithProgress: (...args: unknown[]) =>
      mockQueryClickhouseWithProgress(...args),
    buildObservationsFromEventsTableQuery: (...args: unknown[]) =>
      mockBuildObservationsFromEventsTableQuery(...args),
    hydrateObservationsWithModelDataFromEventsTableRows: (...args: unknown[]) =>
      mockHydrateObservationsWithModelDataFromEventsTableRows(...args),
  };
});

const mockBuildEventListQueryOptions = jest.fn();
const mockHydrateEventListObservations = jest.fn();

jest.mock("../../features/events/server/eventsService", () => {
  const actual = jest.requireActual(
    "../../features/events/server/eventsService",
  );
  return {
    ...actual,
    buildEventListQueryOptions: (...args: unknown[]) =>
      mockBuildEventListQueryOptions(...args),
    hydrateEventListObservations: (...args: unknown[]) =>
      mockHydrateEventListObservations(...args),
  };
});

import handler from "../../pages/api/events/execute-table-stream";

function createPostMocks(body: unknown) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: "POST",
    body,
  });
  res.flushHeaders = jest.fn();
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

describe("execute-events-table-stream handler", () => {
  const projectId = "project-1";

  const makeSession = (overrides?: {
    v4BetaEnabled?: boolean;
    projects?: Array<{ id: string }>;
  }) => ({
    user: {
      id: "user-1",
      email: "test@example.com",
      admin: false,
      v4BetaEnabled: overrides?.v4BetaEnabled ?? true,
      organizations: [
        {
          id: "org-1",
          projects: overrides?.projects ?? [{ id: projectId }],
        },
      ],
    },
  });

  const makeBody = () => ({
    projectId,
    filter: [],
    searchQuery: null,
    searchType: ["id", "content"],
    orderBy: null,
    page: 1,
    limit: 50,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildEventListQueryOptions.mockReturnValue({
      projectId,
      filter: [],
      searchQuery: undefined,
      searchType: ["id", "content"],
      orderBy: null,
      limit: 50,
      offset: 0,
      selectIOAndMetadata: false,
      renderingProps: { truncated: true, shouldJsonParse: false },
    });
    mockBuildObservationsFromEventsTableQuery.mockReturnValue({
      query: "SELECT 1",
      params: {},
    });
    mockHydrateObservationsWithModelDataFromEventsTableRows.mockImplementation(
      async (rows) => rows,
    );
    mockHydrateEventListObservations.mockImplementation(
      async ({ observations }) => ({
        observations,
      }),
    );
  });

  it("returns 400 when v4 beta is disabled", async () => {
    mockGetServerAuthSession.mockResolvedValue(
      makeSession({ v4BetaEnabled: false }),
    );
    const { req, res } = createPostMocks(makeBody());

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toMatchObject({
      message:
        "Streaming is only supported for v4-enabled traces table queries",
    });
  });

  it("returns 401 when no session is present", async () => {
    mockGetServerAuthSession.mockResolvedValue(null);
    const { req, res } = createPostMocks(makeBody());

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(JSON.parse(res._getData())).toMatchObject({
      message: "Unauthorized",
    });
  });

  it("streams progress and a single final result payload", async () => {
    mockGetServerAuthSession.mockResolvedValue(makeSession());
    mockQueryClickhouseWithProgress.mockImplementation(async function* () {
      yield {
        progress: {
          read_rows: "100",
          total_rows_to_read: "500",
          elapsed_ns: "10",
          read_bytes: "1024",
        },
      };
      yield {
        row: {
          id: "obs-1",
          traceId: "trace-1",
          startTime: new Date("2026-03-24T09:00:00.000Z"),
        },
      };
    });

    const { req, res } = createPostMocks(makeBody());

    await handler(req, res);

    const events = parseSSEEvents(res._getData());
    const progressEvents = events.filter((event) => event.event === "progress");
    const resultEvents = events.filter((event) => event.event === "result");

    expect(progressEvents).toHaveLength(1);
    expect(resultEvents).toHaveLength(1);
    expect(events.filter((event) => event.event === "row")).toHaveLength(0);
    expect(events.some((event) => event.event === "done")).toBe(true);

    const result = superjson.deserialize<{
      observations: Array<{ id: string; startTime: Date }>;
    }>(JSON.parse(resultEvents[0].data));
    expect(result.observations[0]?.id).toBe("obs-1");
    expect(result.observations[0]?.startTime).toBeInstanceOf(Date);
  });

  it("emits resource-limit SSE errors with a stable kind", async () => {
    mockGetServerAuthSession.mockResolvedValue(makeSession());
    mockQueryClickhouseWithProgress.mockImplementation(async function* () {
      yield {
        exception: "Code: 241. DB::Exception: memory limit exceeded",
      };
    });

    const { req, res } = createPostMocks(makeBody());

    await handler(req, res);

    const events = parseSSEEvents(res._getData());
    const errorEvent = events.find((event) => event.event === "error");

    expect(errorEvent).toBeDefined();
    expect(JSON.parse(errorEvent!.data)).toMatchObject({
      kind: "resource_limit",
    });
  });
});
