import { assert, beforeEach, describe, expect, it, vi } from "vitest";
import { type FilterState } from "../../types";

const mocks = vi.hoisted(() => ({ query: vi.fn(), random: vi.fn() }));
vi.mock("../../env", () => ({ env: {} }));
vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../instrumentation", () => ({}));
vi.mock("../repositories/clickhouse", () => ({
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
    const sessionParam = /e\.session_id = \{(\w+):\s*String\}/.exec(query)?.[1];
    const projectParam = /e\.project_id = \{(\w+):\s*String\}/.exec(query)?.[1];
    assert(sessionParam);
    assert(projectParam);
    expect(params[sessionParam]).toBe("session");
    expect(params[projectParam]).toBe("project");
    expect(query).toMatch(/order by (?:t\.)?timestamp asc/i);
    expect(query).not.toContain("t.id IN (");
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

  it("matches all observation predicates on the same observation, including children, within the authorized session", async () => {
    const filter: FilterState = [
      { column: "name", type: "string", operator: "=", value: "agent" },
      { column: "level", type: "string", operator: "=", value: "ERROR" },
    ];
    await getSessionTracesFromEvents({
      projectId: "project",
      sessionId: "session",
      filter,
    });
    const { query, params } = capturedQuery();
    expect(query).toContain("AND t.id IN (");
    const observationQuery = query.slice(query.indexOf("AND t.id IN ("));
    expect(observationQuery).not.toContain("e.is_app_root = true");
    expect(observationQuery).not.toContain("e.parent_span_id = ''");
    expect(observationQuery).not.toContain("FROM session_traces");
    expect(observationQuery).toMatch(
      /e\.trace_id IN \(select e\.trace_id from/i,
    );
    const sessionParam = /e\.session_id = \{(\w+):\s*String\}/.exec(
      observationQuery,
    )?.[1];
    assert(sessionParam);
    expect(params[sessionParam]).toBe("session");
    expect(observationQuery).not.toMatch(/group by/i);
    expect(query).toContain("e.is_deleted = 0");
    expect(query).toContain("e.name");
    expect(query).toContain("e.level");
    expect(Object.values(params)).toContain("agent");
    expect(Object.values(params)).toContain("ERROR");
  });

  it("filters root observations within the session", async () => {
    await getSessionTracesFromEvents({
      projectId: "project",
      sessionId: "session",
      filter: [
        {
          column: "isRootObservation",
          type: "boolean",
          operator: "=",
          value: true,
        },
      ],
    });
    const { query } = capturedQuery();
    expect(query).toContain("AND t.id IN (");
    expect(query).toMatch(/e\.trace_id IN \(select e\.trace_id from/i);
    expect(query).toContain("e.is_app_root");
  });

  it("applies trace names separately from observation matching when hiding empty traces", async () => {
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
        { column: "name", type: "string", operator: "=", value: "agent" },
      ],
    });

    const { query, params } = capturedQuery();
    expect(query).toContain("t.name");
    expect(query).toContain("AND t.id IN (");
    const observationQuery = query.slice(query.indexOf("AND t.id IN ("));
    expect(observationQuery).toContain("e.name");
    expect(observationQuery).not.toContain("t.name");
    expect(Object.values(params)).toContain("conversation");
    expect(Object.values(params)).toContain("agent");
  });

  it("uses full metadata rather than truncated observation metadata", async () => {
    await getSessionTracesFromEvents({
      projectId: "project",
      sessionId: "session",
      filter: [
        {
          column: "metadata",
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
        {
          column: "unsupported",
          type: "string",
          operator: "=",
          value: "child",
        },
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

  it("normalizes saved root filters to observation filters", () => {
    expect(
      sessionTraceFilterSchema.parse([
        { column: "rootName", type: "string", operator: "=", value: "agent" },
        {
          column: "rootType",
          type: "string",
          operator: "=",
          value: "GENERATION",
        },
        { column: "rootLevel", type: "string", operator: "=", value: "ERROR" },
        {
          column: "rootMetadata",
          type: "stringObject",
          key: "region",
          operator: "=",
          value: "eu",
        },
      ]),
    ).toEqual([
      { column: "name", type: "string", operator: "=", value: "agent" },
      { column: "type", type: "string", operator: "=", value: "GENERATION" },
      { column: "level", type: "string", operator: "=", value: "ERROR" },
      {
        column: "metadata",
        type: "stringObject",
        key: "region",
        operator: "=",
        value: "eu",
      },
    ]);
  });
});
