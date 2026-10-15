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
  getAgentSessionProjectionFromEventsTable,
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

describe("agent session projection", () => {
  const scope = {
    projectId: "projection-project",
    from: new Date("2026-10-15T11:00:00Z"),
    to: new Date("2026-10-15T15:00:00Z"),
    agentNames: ["planner"],
    baselineDays: 14 as const,
  };
  const event = (values: Record<string, unknown> = {}) => ({
    trace_id: "trace-1",
    span_id: "agent-1",
    parent_span_id: "",
    session_id: "session-1",
    agent_name: "planner",
    type: "AGENT",
    name: "planner",
    start_time: "2026-10-15 14:00:00.000",
    end_time: "2026-10-15 14:00:01.000",
    event_ts: "2026-10-15 14:01:00.000",
    is_deleted: 0,
    cost: "0",
    tokens: "0",
    input: "",
    skill_name: "",
    available_tools: [],
    declared_tools: "",
    available_skills: "",
    task: "",
    area: "",
    topic: "",
    parent_session_id: "",
    parent_agent_name: "",
    ...values,
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryClickhouse.mockReset().mockResolvedValue([]);
    vi.mocked(parseClickhouseUTCDateTimeFormat).mockImplementation(
      (value) => new Date(value.replace(" ", "T") + "Z"),
    );
  });

  it("counts real sessions, includes zero-tool units, and keeps fallback cost outside session averages", async () => {
    const rows = [
      event(),
      event({ span_id: "agent-2", trace_id: "trace-2" }),
      event({ span_id: "tool", type: "TOOL", name: "search", cost: "1" }),
      event({ span_id: "model", type: "GENERATION", cost: "2", tokens: "5" }),
      event({
        span_id: "writer",
        agent_name: "writer",
        type: "GENERATION",
        cost: "99",
        end_time: "2026-10-15 14:02:00.000",
      }),
      event({
        span_id: "zero",
        trace_id: "zero-trace",
        session_id: "zero-session",
      }),
      event({
        span_id: "fallback",
        trace_id: "fallback-trace",
        session_id: "",
        type: "GENERATION",
        cost: "10",
      }),
    ];
    mockQueryClickhouse.mockResolvedValueOnce(rows).mockResolvedValueOnce(rows);
    const result = await getAgentSessionProjectionFromEventsTable(scope);
    expect(result.agents[0].current).toMatchObject({
      sessions: 2,
      invocations: 3,
      toolInvocations: 1,
      cost: 13,
      averageCostPerSession: 1.5,
      averageToolsPerSession: 0.5,
    });
    expect(
      result.sessions.find((row) => row.sessionId === "session-1"),
    ).toMatchObject({
      traceCount: 2,
      cost: 3,
      sessionElapsedMs: 120_000,
      participatingAgentNames: ["planner", "writer"],
      completePerSession: true,
    });
    expect(result.sessions.find((row) => row.kind === "trace")).toMatchObject({
      sessionId: null,
      cost: 10,
      completePerSession: false,
      completenessReason: "missing-session-id",
    });
    expect(result.coverage.missingSessionTraces).toBe(1);
    for (const [request] of mockQueryClickhouse.mock.calls) {
      expect(request.query).toContain("e.project_id = {projectId: String}");
      expect(request.query).toContain("e.event_ts DESC");
      expect(request.query).not.toContain(" FINAL");
      expect(request.clickhouseSettings.max_execution_time).toBe(10);
    }
  });

  it("uses the latest identity/type and tombstone before attributing a rewritten observation", async () => {
    mockQueryClickhouse.mockResolvedValueOnce([
      event({ cost: "50" }),
      event({
        agent_name: "writer",
        type: "TOOL",
        event_ts: "2026-10-15 14:02:00.000",
      }),
      event({ span_id: "deleted", cost: "20", is_deleted: 1 }),
    ]);
    const result = await getAgentSessionProjectionFromEventsTable(scope);
    expect(result.agents[0].current).toMatchObject({
      sessions: 0,
      cost: 0,
      observations: 0,
    });
    expect(result.sessions).toEqual([]);
  });

  it("compares complete per-session cohorts in disjoint anchored windows, including zero tools", async () => {
    const rows = Array.from({ length: 25 }, (_, i) => {
      const start_time =
        i < 20 ? "2026-10-10 12:00:00.000" : "2026-10-15 14:30:00.000";
      const end_time =
        i < 20 ? "2026-10-10 12:00:01.000" : "2026-10-15 14:30:01.000";
      const common = {
        trace_id: `trace-${i}`,
        session_id: `session-${i}`,
        start_time,
        end_time,
      };
      return [
        event({ ...common, span_id: `agent-${i}` }),
        ...(i < 20
          ? [0, 1].map((tool) =>
              event({
                ...common,
                span_id: `tool-${i}-${tool}`,
                type: "TOOL",
                name: "search",
              }),
            )
          : []),
      ];
    }).flat();
    rows.push(
      event({
        trace_id: "open-trace",
        session_id: "open-session",
        span_id: "open-span",
        end_time: null,
      }),
    );
    mockQueryClickhouse.mockResolvedValueOnce(rows).mockResolvedValueOnce(rows);
    const result = await getAgentSessionProjectionFromEventsTable(scope);
    expect(result.recentWindow.from).toEqual(new Date("2026-10-15T14:00:00Z"));
    expect(result.baselineWindow.to).toEqual(result.recentWindow.from);
    expect(result.agents[0]).toMatchObject({
      comparisonStatus: "ready",
      excludedSessions: 1,
      baseline: { sessions: 20, averageToolsPerSession: 2 },
      recent: { sessions: 5, averageToolsPerSession: 0, zeroToolSessions: 5 },
    });
    expect(result.agents[0].signals.map((signal) => signal.kind)).toContain(
      "missing-tools",
    );
  });

  it("keeps selected-window accounting and drilldowns separate from whole-session history", async () => {
    const current = event({ cost: "1" });
    const earlier = event({
      span_id: "earlier",
      type: "TOOL",
      name: "old-search",
      cost: "5",
      start_time: "2026-10-15 10:00:00.000",
      end_time: "2026-10-15 10:00:01.000",
    });
    mockQueryClickhouse
      .mockResolvedValueOnce([current])
      .mockResolvedValueOnce([current, earlier]);
    const result = await getAgentSessionProjectionFromEventsTable(scope);
    expect(result.agents[0].current).toMatchObject({
      cost: 1,
      observations: 1,
      toolInvocations: 0,
    });
    expect(result.sessions[0]).toMatchObject({
      cost: 6,
      toolInvocations: 1,
      windowCost: 1,
      windowToolInvocations: 0,
      windowObservationCount: 1,
      toolNames: [],
      completePerSession: true,
    });
    expect(mockQueryClickhouse.mock.calls[1][0].params.projectionFrom).toBe(
      "1970-01-01 00:00:00.000",
    );
    expect(
      mockQueryClickhouse.mock.calls[1][0].params.projectionSessionIds,
    ).toEqual(["session-1"]);
  });

  it("keeps canonical legacy trace wrappers in context without treating them as open executions", async () => {
    const rows = [
      event(),
      event({
        span_id: "t-trace-1",
        agent_name: "",
        type: "SPAN",
        end_time: null,
      }),
    ];
    mockQueryClickhouse
      .mockResolvedValueOnce([rows[0]])
      .mockResolvedValueOnce(rows);
    const result = await getAgentSessionProjectionFromEventsTable(scope);
    expect(result.sessions[0]).toMatchObject({
      completePerSession: true,
      completenessReason: "complete",
      sessionElapsedMs: 1000,
    });
    expect(result.agents[0].current.observations).toBe(1);
  });

  it("decodes escaped skill names and distinguishes available tools from executed tools", async () => {
    const rows = [
      event({
        span_id: "skill",
        type: "TOOL",
        name: "namespace.load_skill",
        input: '{"name":"r\\u00e9sum\\u00e9"}',
        declared_tools: '["unused"]',
      }),
      event({ span_id: "not-skill", type: "TOOL", name: "upskill" }),
    ];
    mockQueryClickhouse.mockResolvedValueOnce(rows).mockResolvedValueOnce(rows);
    const result = await getAgentSessionProjectionFromEventsTable(scope);
    expect(result.skills).toMatchObject([
      { name: "résumé", invocations: 1, available: false },
    ]);
    expect(result.tools.find((row) => row.name === "unused")).toMatchObject({
      invocations: 0,
      available: true,
    });
    expect(result.tools.find((row) => row.name === "upskill")).toMatchObject({
      invocations: 1,
      available: false,
    });
    expect(result.sessions[0].skillNames).toEqual(["résumé"]);
  });

  it("prefers native skill references per observation, preserves multiple names and reports mixed legacy evidence", async () => {
    const rows = [
      event({
        span_id: "native",
        trace_id: "native-trace",
        type: "TOOL",
        name: "load_skill",
        skill_name: "wrong-fallback",
        native_loaded_names: ["native-one", "native-one", "native-two"],
        native_available_names: ["native-one", "unused-native"],
      }),
      event({
        span_id: "legacy",
        trace_id: "legacy-trace",
        type: "TOOL",
        name: "load_skill",
        skill_name: "native-one",
      }),
    ];
    mockQueryClickhouse.mockResolvedValueOnce(rows).mockResolvedValueOnce(rows);
    const result = await getAgentSessionProjectionFromEventsTable(scope);
    expect(
      result.skills.find((row) => row.name === "native-one"),
    ).toMatchObject({ invocations: 2, source: "mixed", available: true });
    expect(
      result.skills.find((row) => row.name === "native-two"),
    ).toMatchObject({
      invocations: 1,
      source: "native",
      sampleTraceIds: ["native-trace"],
    });
    expect(
      result.skills.find((row) => row.name === "unused-native"),
    ).toMatchObject({ invocations: 0, source: "native", available: true });
    expect(result.skills.some((row) => row.name === "wrong-fallback")).toBe(
      false,
    );
    expect(
      result.activity.reduce((total, row) => total + row.skillInvocations, 0),
    ).toBe(3);
    expect(result.agents[0].availableSkillNames).toEqual([
      "native-one",
      "unused-native",
    ]);
  });

  it("never turns open or capped session history into a ready comparison", async () => {
    const rows = [event({ end_time: null })];
    mockQueryClickhouse.mockResolvedValueOnce(rows).mockResolvedValueOnce(rows);
    const open = await getAgentSessionProjectionFromEventsTable(scope);
    expect(open.sessions[0]).toMatchObject({
      completePerSession: false,
      completenessReason: "open-span",
    });
    expect(open.agents[0]).toMatchObject({
      comparisonStatus: "insufficient-data",
      excludedSessions: 1,
      signals: [],
    });

    const many = Array.from({ length: 501 }, (_, i) =>
      event({
        session_id: `session-${i}`,
        trace_id: `trace-${i}`,
        span_id: `span-${i}`,
      }),
    );
    mockQueryClickhouse.mockResolvedValueOnce(many).mockResolvedValueOnce(many);
    const capped = await getAgentSessionProjectionFromEventsTable(scope);
    expect(capped.coverage).toMatchObject({
      sessionsTruncated: true,
      historyComplete: false,
    });
    expect(capped.sessions).toHaveLength(500);
    expect(capped.sessions.every((row) => !row.completePerSession)).toBe(true);
    expect(capped.agents[0]).toMatchObject({
      comparisonStatus: "incomplete-cohort",
      signals: [],
    });
  });
});

describe("getObservationsV2FromEventsTableForPublicApi query shape", () => {
  beforeEach(() => {
    charCounter = 0;
    vi.clearAllMocks();
    mockQueryClickhouse.mockReset().mockResolvedValue([]);
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
    mockQueryClickhouse.mockReset().mockResolvedValue([]);
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
