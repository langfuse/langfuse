import { beforeEach, describe, expect, it, vi } from "vitest";
import { type FilterState } from "../../types";

const mocks = vi.hoisted(() => ({ query: vi.fn(), random: vi.fn() }));
vi.mock("../../env", () => ({ env: {} }));
vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../instrumentation", () => ({}));
vi.mock("../repositories", () => ({
  OBSERVATIONS_TO_TRACE_INTERVAL: "INTERVAL 2 DAY",
  SCORE_TO_TRACE_OBSERVATIONS_INTERVAL: "INTERVAL 1 HOUR",
  clickhouseCompliantRandomCharacters: mocks.random,
  queryClickhouse: mocks.query,
  reduceUsageOrCostDetails: (details: Record<string, number>) => details,
}));

import { getSessionTracesFromEvents } from "./sessions-ui-table-events-service";
import { sessionTraceFilterSchema } from "../../features/filters/sessionTraceFilters";

const capturedQuery = () => {
  const request = mocks.query.mock.calls[0][0] as {
    query: string;
    params: Record<string, unknown>;
  };
  return { ...request, query: request.query.replace(/\s+/g, " ") };
};

describe("session trace filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let counter = 0;
    mocks.random.mockImplementation(() => `x${++counter}`);
    mocks.query.mockResolvedValue([]);
  });

  it("keeps session membership and chronological order without filters", async () => {
    await getSessionTracesFromEvents({
      projectId: "project",
      sessionId: "session",
      filter: [],
    });
    const { query, params } = capturedQuery();
    expect(query).toContain("e.session_id = {sessionId: String}");
    expect(query).toContain("ORDER BY t.timestamp ASC");
    expect(query).not.toContain("t.id IN (");
    expect(params).toMatchObject({
      projectId: "project",
      sessionId: "session",
    });
  });

  it("filters aggregated trace attributes, not individual transcript observations", async () => {
    await getSessionTracesFromEvents({
      projectId: "project",
      sessionId: "session",
      filter: [
        {
          column: "traceName",
          type: "string",
          operator: "=",
          value: "conversation",
        },
        {
          column: "traceTags",
          type: "arrayOptions",
          operator: "none of",
          value: ["internal"],
        },
      ],
    });
    const { query, params } = capturedQuery();
    expect(query).toMatch(/SELECT t\.\* FROM session_traces t WHERE 1 = 1 AND/);
    expect(query).toContain("t.name");
    expect(query).toContain("t.tags");
    expect(Object.values(params)).toContain("conversation");
    expect(Object.values(params)).toContainEqual(["internal"]);
    expect(query).not.toContain("AND t.id IN (");
  });

  it("matches all root predicates on the same root within the authorized session", async () => {
    const filter: FilterState = [
      { column: "rootName", type: "string", operator: "=", value: "agent" },
      { column: "rootLevel", type: "string", operator: "=", value: "ERROR" },
    ];
    await getSessionTracesFromEvents({
      projectId: "project",
      sessionId: "session",
      filter,
    });
    const { query, params } = capturedQuery();
    expect(query).toContain("AND t.id IN (");
    expect(query).toContain("e.parent_span_id = '' OR e.is_app_root = true");
    expect(query).toContain("e.trace_id IN (SELECT id FROM session_traces)");
    expect(query).toContain("e.is_deleted = 0");
    expect(query).toContain("e.name");
    expect(query).toContain("e.level");
    expect(Object.values(params)).toContain("agent");
    expect(Object.values(params)).toContain("ERROR");
  });

  it("uses full metadata rather than truncated root metadata", async () => {
    await getSessionTracesFromEvents({
      projectId: "project",
      sessionId: "session",
      filter: [
        {
          column: "rootMetadata",
          type: "stringObject",
          key: "kind",
          operator: "=",
          value: "customer",
        },
      ],
    });
    const { query } = capturedQuery();
    expect(query).toContain("FROM events_full");
    expect(query).toContain("e.metadata_values");
  });

  it.each([
    {
      filter: [
        { column: "name", type: "string", operator: "=", value: "child" },
      ],
    },
    {
      filter: [
        {
          column: "positionInTrace",
          type: "positionInTrace",
          operator: "=",
          key: "root",
        },
      ],
    },
    {
      filter: [{ column: "rootName", type: "number", operator: "=", value: 1 }],
    },
  ])(
    "rejects unsupported filters instead of silently ignoring them",
    ({ filter }) => {
      expect(sessionTraceFilterSchema.safeParse(filter).success).toBe(false);
    },
  );
});
