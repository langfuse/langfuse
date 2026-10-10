import { describe, it, expect, beforeEach, vi } from "vitest";

const mockQueryClickhouse = vi.hoisted(() => vi.fn());
let charCounter = 0;

vi.mock("./clickhouse", () => ({
  queryClickhouse: mockQueryClickhouse,
  commandClickhouse: vi.fn(),
  queryClickhouseStream: vi.fn(),
  queryClickhouseStreamRawText: vi.fn(),
  queryClickhouseExecRaw: vi.fn(),
  parseClickhouseUTCDateTimeFormat: vi.fn(),
  BLOB_EXPORT_PARQUET_CLICKHOUSE_SETTINGS: {},
  // Return unique names per call so filter parameter variables don't collide
  clickhouseCompliantRandomCharacters: vi.fn(() => `x${++charCounter}`),
}));

import { getObservationsV2FromEventsTableForPublicApi } from "./events";
import {
  getAgentMapSkeleton,
  getAgentMetricsFromEventsTable,
  getAgentSkillsFromEventsTable,
  getAgentStatsFromEventsTable,
  getAgentsCountFromEventsTable,
  getAgentsFromEventsTable,
  hasAnyAgentFromEventsTable,
} from "./agents";
import { parseClickhouseUTCDateTimeFormat } from "./clickhouse";
import { type EventsTableFilterState, type FilterState } from "../../types";

const inputContainsFilter: EventsTableFilterState = [
  { type: "string", column: "input", operator: "contains", value: "needle" },
];

const captureQuery = () => {
  const call = mockQueryClickhouse.mock.calls.at(0);
  return (call?.[0] as { query: string }).query;
};

const baseOpts = { projectId: "proj-1", page: 1, limit: 50 } as const;

describe("getObservationsV2FromEventsTableForPublicApi query shape", () => {
  beforeEach(() => {
    charCounter = 0;
    vi.clearAllMocks();
    mockQueryClickhouse.mockResolvedValue([]);
  });

  it("skips the io-lane split when a content filter forces base onto events_full", async () => {
    await getObservationsV2FromEventsTableForPublicApi(
      {
        ...baseOpts,
        fields: ["core", "io"],
        advancedFilters: inputContainsFilter,
      },
      { allowUnindexedIoFilters: true },
    );

    const query = captureQuery();
    // Single-pass scan on events_full: no base/io CTE split, io read inline.
    expect(query).not.toContain("FROM base");
    expect(query).not.toContain("_io_start_time");
    expect(query).toContain("e.input");
    expect(query).toContain("e.output");
    // Exactly one events_full read (the split would reference it twice).
    expect((query.match(/events_full/g) ?? []).length).toBe(1);
    expect(query).not.toContain("events_core");
  });

  it("keeps the io-lane split when no content filter forces events_full", async () => {
    await getObservationsV2FromEventsTableForPublicApi({
      ...baseOpts,
      fields: ["core", "io"],
    });

    const query = captureQuery();
    // Base filters on the cheap truncated table; io lane reads full columns
    // only for the matched, page-sized rows.
    expect(query).toContain("FROM events_core");
    expect(query).toContain("FROM base");
    expect(query).toContain("_io_start_time");
  });
});

describe("metadata-backed agent queries", () => {
  const scope = {
    projectId: "agent-project",
    from: new Date("2026-10-01T00:00:00.000Z"),
    to: new Date("2026-10-08T00:00:00.000Z"),
    filter: [
      {
        column: "environment",
        type: "stringOptions",
        operator: "any of",
        value: ["production"],
      },
    ] as FilterState,
  };

  beforeEach(() => {
    charCounter = 0;
    vi.clearAllMocks();
    mockQueryClickhouse.mockResolvedValue([]);
    vi.mocked(parseClickhouseUTCDateTimeFormat).mockImplementation(
      (value) => new Date(value.replace(" ", "T") + "Z"),
    );
  });

  it("keeps discovery, metrics, skills and map selection in the same project, time and environment scope", async () => {
    await getAgentsFromEventsTable({ ...scope, limit: 50, offset: 0 });
    await getAgentsCountFromEventsTable(scope);
    await getAgentMetricsFromEventsTable({ ...scope, agentNames: ["planner"] });
    await getAgentSkillsFromEventsTable({ ...scope, agentName: "planner" });
    await getAgentMapSkeleton({ ...scope, agentName: "planner" });
    await hasAnyAgentFromEventsTable(scope);

    expect(mockQueryClickhouse).toHaveBeenCalledTimes(6);
    for (const [request] of mockQueryClickhouse.mock.calls) {
      expect(request.query).toContain("e.project_id = {projectId: String}");
      expect(request.query).toContain(
        "e.start_time >= {agentFrom: DateTime64(3, 'UTC')}",
      );
      expect(request.query).toContain(
        "e.start_time <= {agentTo: DateTime64(3, 'UTC')}",
      );
      expect(request.query).toContain("e.is_deleted = 0");
      expect(request.query).toContain("e.environment");
      expect(request.query).not.toContain(" FINAL");
      expect(request.params.projectId).toBe(scope.projectId);
      expect(request.params.agentFrom).toBe("2026-10-01 00:00:00.000");
      expect(request.params.agentTo).toBe("2026-10-08 00:00:00.000");
      expect(Object.values(request.params)).toContainEqual(["production"]);
    }
  });

  it("does not scan metrics when the visible page has no agents", async () => {
    expect(
      await getAgentMetricsFromEventsTable({ ...scope, agentNames: [] }),
    ).toEqual([]);
    expect(mockQueryClickhouse).not.toHaveBeenCalled();
  });

  it("preserves UInt64 tokens and reports empty windows without fabricated seen dates", async () => {
    mockQueryClickhouse.mockResolvedValueOnce([
      {
        agent_name: "planner",
        observation_count: "3",
        trace_count: "2",
        run_count: "1",
        total_cost: "0.123456789012",
        input_usage: "9007199254740993",
        output_usage: "2",
        total_usage: "9007199254740995",
        first_seen: "2026-10-01 00:00:00.000",
        last_seen: "2026-10-08 00:00:00.000",
      },
    ]);
    const [metrics] = await getAgentMetricsFromEventsTable({
      ...scope,
      agentNames: ["planner"],
    });
    expect(metrics).toMatchObject({
      totalPromptTokens: 9007199254740993n,
      totalTokens: 9007199254740995n,
      totalRuns: 1n,
      averageCostPerTrace: 0.061728394506,
    });

    const empty = await getAgentStatsFromEventsTable({
      ...scope,
      agentName: "missing",
    });
    expect(empty).toMatchObject({
      firstSeen: null,
      lastSeen: null,
      totalTraces: 0n,
      totalObservations: 0n,
      sumCalculatedTotalCost: 0,
    });
  });

  it("matches named skill tools and wrappers without treating unrelated skill substrings as skills", async () => {
    await getAgentSkillsFromEventsTable({ ...scope, agentName: "planner" });
    const request = mockQueryClickhouse.mock.calls[0]?.[0];
    const matches = new RegExp(request.params.skillToolPattern, "i");
    for (const name of [
      "Skill",
      "skills",
      "execute_tool load_skill",
      "read_skill_resource",
      "tool:run_skill_script",
    ]) {
      expect(matches.test(name), name).toBe(true);
    }
    for (const name of [
      "skillful_search",
      "upskill",
      "load_skills_database",
      "get_skill_score",
    ]) {
      expect(matches.test(name), name).toBe(false);
    }
    const extracts = new RegExp(request.params.skillInputPattern);
    expect(extracts.exec('{"skillName":"reasoning"}')?.[1]).toBe("reasoning");
    expect(extracts.exec('{"skill":"cut-off')).toBeNull();
    expect(extracts.exec('{"name":"r\\u00e9sum\\u00e9"}')?.[1]).toBe(
      "r\\u00e9sum\\u00e9",
    );
    // JSON escape spellings must normalize before GROUP BY, so input and metadata share one skill identity.
    expect(request.query).toContain(
      `JSONExtractString(concat('"', extract(e.input, {skillInputPattern: String}), '"'))`,
    );
  });

  it("reports both map caps and loads unnamed ancestry within the same bounded scope", async () => {
    mockQueryClickhouse
      .mockResolvedValueOnce(
        Array.from({ length: 101 }, (_, i) => ({ trace_id: `trace-${i}` })),
      )
      .mockResolvedValueOnce(
        Array.from({ length: 20_001 }, (_, i) => ({
          trace_id: "trace-0",
          span_id: `span-${i}`,
          parent_span_id: i === 0 ? null : "outside-window",
          type: "AGENT",
          agent_name: i === 0 ? "planner" : "",
          start_time: "2026-10-01 00:00:00.000",
        })),
      );
    const map = await getAgentMapSkeleton({ ...scope, agentName: "planner" });
    expect(map).toMatchObject({
      traceCount: 100,
      tracesTruncated: true,
      rowsTruncated: true,
      isTruncated: true,
      windowBounded: true,
    });
    expect(map.rows).toHaveLength(20_000);
    expect(map.rows[1]).toMatchObject({
      parentSpanId: "outside-window",
      agentName: null,
    });

    const skeleton = mockQueryClickhouse.mock.calls[1]?.[0];
    expect(skeleton.params.agentTraceIds).toEqual(map.traceIds);
    expect(skeleton.query).toContain("e.project_id = {projectId: String}");
    expect(skeleton.query).toContain(
      "e.start_time >= {agentFrom: DateTime64(3, 'UTC')}",
    );
    expect(skeleton.query).toContain("e.environment");
    // Parentage belongs to the newest rewrite even when its start time was corrected backwards.
    expect(skeleton.query).toContain(
      "ORDER BY e.event_ts DESC, e.start_time DESC, e.trace_id ASC, e.span_id ASC",
    );
    expect(skeleton.query).toContain("LIMIT 1 BY e.trace_id, e.span_id");
    expect(skeleton.query).not.toContain("has(e.metadata_names");
    expect(skeleton.query).not.toContain("e.input");
    expect(skeleton.query).not.toContain("e.output");
  });
});
