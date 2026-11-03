import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const mockQueryClickhouse = vi.hoisted(() => vi.fn());
const mockQueryClickhouseWithProgress = vi.hoisted(() => vi.fn());
let charCounter = 0;

vi.mock("./clickhouse", async () => {
  const { isRow, isProgressRow, isException } =
    await vi.importActual<typeof import("@clickhouse/client")>(
      "@clickhouse/client",
    );

  return {
    ClickHouseResourceError: class extends Error {
      constructor(
        public readonly errorType: string,
        error: Error,
      ) {
        super(error.message);
      }
      static wrapIfResourceError(error: Error) {
        return error;
      }
    },
    ClickHouseQueryAbortedError: class extends Error {},
    queryClickhouse: mockQueryClickhouse,
    queryClickhouseWithProgress: mockQueryClickhouseWithProgress,
    isRow,
    isProgressRow,
    isException,
    commandClickhouse: vi.fn(),
    queryClickhouseStream: vi.fn(),
    queryClickhouseStreamRawText: vi.fn(),
    queryClickhouseExecRaw: vi.fn(),
    parseClickhouseUTCDateTimeFormat: vi.fn(
      (value: string) => new Date(value.replace(" ", "T") + "Z"),
    ),
    BLOB_EXPORT_PARQUET_CLICKHOUSE_SETTINGS: {},
    // Return unique names per call so filter parameter variables don't collide
    clickhouseCompliantRandomCharacters: vi.fn(() => `x${++charCounter}`),
  };
});

import {
  getObservationsForTraceFromEventsTable,
  getObservationsV2FromEventsTableForPublicApi,
  getObservationsV2PageFromEventsTableForPublicApi,
} from "./events";
import {
  ClickHouseQueryAbortedError,
  parseClickhouseUTCDateTimeFormat,
} from "./clickhouse";
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

import { type EventsTableFilterState, type FilterState } from "../../types";

const inputContainsFilter: EventsTableFilterState = [
  { type: "string", column: "input", operator: "contains", value: "needle" },
];

const captureQuery = () => {
  const call = mockQueryClickhouse.mock.calls.at(0);
  // eslint-disable-next-line no-unsafe-optional-chaining
  return (call?.[0] as { query: string }).query;
};

const scanBounds = ({
  query,
  params,
}: {
  query: string;
  params: Record<string, string>;
}) =>
  Object.fromEntries(
    [...query.matchAll(/e\.start_time (>=|<=?) \{(\w+):/g)].map(
      ([, operator, name]) => [operator === ">=" ? "from" : "to", params[name]],
    ),
  );

const baseOpts = { projectId: "proj-1", page: 1, limit: 50 } as const;
const boundedOpts = {
  ...baseOpts,
  fields: ["core" as const],
  fromStartTime: "2026-10-01T00:00:00.000Z",
  toStartTime: "2026-10-19T00:00:00.000Z",
};
const observation = (id: string, startTime: string) => ({
  id,
  trace_id: "trace-1",
  project_id: "proj-1",
  start_time: startTime,
  type: "SPAN",
});

const rowEvent = <T>(row: T) => ({ row });
const progressEvent = (readRows: number, readBytes = 0) => ({
  progress: {
    read_rows: String(readRows),
    read_bytes: String(readBytes),
    elapsed_ns: "0",
  },
});
const mockProgressQuery = (...events: unknown[]) => {
  mockQueryClickhouseWithProgress.mockImplementationOnce(async function* () {
    for (const event of events) yield event;
  });
};
const mockProgressError = (error: Error) => {
  mockQueryClickhouseWithProgress.mockImplementationOnce(async function* () {
    yield progressEvent(0);
    throw error;
  });
};

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

describe("getObservationsForTraceFromEventsTable root flag", () => {
  beforeEach(() => {
    charCounter = 0;
    vi.clearAllMocks();
    mockQueryClickhouse.mockResolvedValue([]);
  });

  it.each([
    { selectMetadata: true, selectIOAndMetadata: false },
    { selectMetadata: false, selectIOAndMetadata: true },
    { selectMetadata: true, selectIOAndMetadata: true },
    { selectMetadata: false, selectIOAndMetadata: false },
  ])("selects metadata independently of I/O: %j", async (selection) => {
    await getObservationsForTraceFromEventsTable({
      projectId: "proj-1",
      traceId: "trace-1",
      ...selection,
    });

    const query = captureQuery();
    expect(query.includes("e.metadata")).toBe(
      selection.selectMetadata || selection.selectIOAndMetadata,
    );
    expect(/\binput\b/.test(query)).toBe(selection.selectIOAndMetadata);
    expect(/\boutput\b/.test(query)).toBe(selection.selectIOAndMetadata);
  });

  it.each([false, true])(
    "selects natural and application roots with tool data=%s",
    async (selectToolData) => {
      await getObservationsForTraceFromEventsTable({
        projectId: "proj-1",
        traceId: "trace-1",
        selectToolData,
      });

      const query = captureQuery();
      expect(query).toContain(
        "toBool((e.parent_span_id = '' or e.is_app_root = true)) as \"is_root_observation\"",
      );
    },
  );
});

describe("getObservationsV2FromEventsTableForPublicApi query shape", () => {
  beforeEach(() => {
    charCounter = 0;
    vi.clearAllMocks();
    mockQueryClickhouseWithProgress.mockReset();
    mockQueryClickhouse.mockResolvedValue([]);
  });

  afterEach(() => vi.restoreAllMocks());

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

  it("walks past empty windows, keeps the lookahead, and resumes with a row cursor", async () => {
    mockProgressQuery(
      rowEvent(observation("newer", "2026-10-12 00:00:00.000")),
    );
    mockProgressQuery(progressEvent(2_500_000));
    mockProgressQuery(
      rowEvent(observation("older", "2026-10-04 00:00:00.000")),
      rowEvent(observation("lookahead", "2026-10-02 00:00:00.000")),
    );

    const page = await getObservationsV2PageFromEventsTableForPublicApi({
      ...boundedOpts,
      fields: ["core"],
      limit: 2,
    });

    expect(page.items.map((row) => row.id)).toEqual(["newer", "older"]);
    expect(page.cursor).toEqual({
      lastStartTimeTo: new Date("2026-10-04T00:00:00.000Z"),
      lastTraceId: "trace-1",
      lastId: "older",
    });
    const calls = mockQueryClickhouseWithProgress.mock.calls.map(
      ([opts]) => opts,
    );
    expect(calls.map((opts) => scanBounds(opts).from)).toEqual([
      "2026-10-12 00:00:00.000",
      "2026-10-05 00:00:00.000",
      "2026-10-01 00:00:00.000",
    ]);
    expect(calls.map((opts) => opts.params.limit)).toEqual([3, 2, 2]);
  });

  it("returns no cursor once the effective structured time range is exhausted", async () => {
    mockProgressQuery();
    const page = await getObservationsV2PageFromEventsTableForPublicApi({
      ...boundedOpts,
      fields: ["core", "io"],
      advancedFilters: [
        {
          type: "datetime",
          column: "startTime",
          operator: ">=",
          value: new Date("2019-10-10T00:00:00Z"),
        },
        {
          type: "datetime",
          column: "startTime",
          operator: "<=",
          value: new Date("2019-10-11T00:00:00Z"),
        },
      ],
    });

    expect(page).toEqual({ items: [], cursor: undefined });
    expect(mockQueryClickhouseWithProgress).toHaveBeenCalledTimes(1);
    const call = mockQueryClickhouseWithProgress.mock.calls[0][0];
    expect(scanBounds(call)).toEqual({
      from: "2019-10-10 00:00:00.000",
      to: "2019-10-11 00:00:00.000",
    });
    expect(
      [
        ...call.query.matchAll(
          /e\.start_time (>=|<=?) \{\w+: (DateTime64\([^)]+\))\}/g,
        ),
      ]
        .slice(-2)
        .map((match) => match.slice(1)),
    ).toEqual([
      [">=", "DateTime64(3, 'UTC')"],
      ["<=", "DateTime64(3, 'UTC')"],
    ]);
    expect(call.query).toContain("FROM base");
  });

  it.each([45_000, 46_000])(
    "stops at the shared deadline: %i ms elapsed",
    async (elapsed) => {
      const clock = vi.spyOn(performance, "now").mockReturnValue(0);
      mockQueryClickhouseWithProgress.mockImplementationOnce(
        async function* () {
          clock.mockReturnValue(elapsed);
          yield rowEvent(observation("newer", "2026-10-13 00:00:00.000"));
        },
      );

      const page = await getObservationsV2PageFromEventsTableForPublicApi({
        ...boundedOpts,
        fields: ["core"],
      });

      expect(page.items.map((row) => row.id)).toEqual(["newer"]);
      expect(page.cursor?.lastStartTimeTo).toEqual(
        new Date("2026-10-12T00:00:00Z"),
      );
      expect(mockQueryClickhouseWithProgress).toHaveBeenCalledTimes(1);
    },
  );

  it.each([30_000, 42_000, 44_999])(
    "keeps filling the page before the deadline: %i ms elapsed",
    async (elapsed) => {
      const clock = vi.spyOn(performance, "now").mockReturnValue(0);
      mockQueryClickhouseWithProgress.mockImplementationOnce(
        async function* () {
          clock.mockReturnValue(elapsed);
          yield progressEvent(0);
        },
      );
      mockProgressQuery(
        rowEvent(observation("older", "2026-10-11 00:00:00.000")),
        rowEvent(observation("lookahead", "2026-10-10 00:00:00.000")),
      );
      const page = await getObservationsV2PageFromEventsTableForPublicApi({
        ...boundedOpts,
        limit: 1,
      });
      expect(page.items.map((row) => row.id)).toEqual(["older"]);
      expect(page.cursor?.lastId).toBe("older");
      const calls = mockQueryClickhouseWithProgress.mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[1][0].clickhouseSettings.max_execution_time).toBe(
        (45_000 - elapsed) / 1_000,
      );
    },
  );

  it("resumes the interrupted window from the last completed boundary", async () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    mockQueryClickhouseWithProgress.mockImplementationOnce(async function* () {
      clock.mockReturnValue(5_000);
      yield progressEvent(0);
    });
    mockQueryClickhouseWithProgress.mockImplementationOnce(async function* () {
      yield rowEvent(observation("unfinished", "2026-10-11 00:00:00.000"));
      clock.mockReturnValue(45_000);
      throw new ClickHouseQueryAbortedError();
    });
    const page =
      await getObservationsV2PageFromEventsTableForPublicApi(boundedOpts);
    expect(page.items).toEqual([]);
    expect(page.cursor?.lastStartTimeTo).toEqual(
      new Date("2026-10-12T00:00:00Z"),
    );
    expect(mockQueryClickhouseWithProgress).toHaveBeenCalledTimes(2);
    expect(
      mockQueryClickhouseWithProgress.mock.calls[1][0].clickhouseSettings
        .max_execution_time,
    ).toBe(40);

    mockProgressQuery(
      rowEvent(observation("unfinished", "2026-10-11 00:00:00.000")),
    );
    mockProgressQuery();
    const resumed = await getObservationsV2PageFromEventsTableForPublicApi({
      ...boundedOpts,
      cursor: page.cursor,
    });
    expect(resumed.items.map((row) => row.id)).toEqual(["unfinished"]);
    expect(resumed.cursor).toBeUndefined();
    expect(
      scanBounds(mockQueryClickhouseWithProgress.mock.calls[2][0]).to,
    ).toBe("2026-10-12 00:00:00.000");
  });

  it("includes backfilled and future observations when no lower bound is supplied", async () => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-19T00:00:00Z"));
    mockProgressQuery(
      rowEvent(observation("future", "2026-10-20 00:00:00.000")),
      progressEvent(1, 100),
    );
    mockProgressQuery(
      rowEvent(observation("backfilled", "2020-01-01 00:00:00.000")),
    );

    const page = await getObservationsV2PageFromEventsTableForPublicApi({
      ...baseOpts,
      fields: ["core"],
    });

    expect(page.items.map((row) => row.id)).toEqual(["future", "backfilled"]);
    expect(page.cursor).toBeUndefined();
    const calls = mockQueryClickhouseWithProgress.mock.calls;
    expect(calls).toHaveLength(2);
    expect(scanBounds(calls[0][0])).toEqual({
      from: "2026-10-12 00:00:00.000",
    });
    expect(scanBounds(calls[1][0]).from).toBe("2020-01-01 00:00:00.000");
  });

  it("finishes without querying ClickHouse when the upper bound precedes the default floor", async () => {
    const page = await getObservationsV2PageFromEventsTableForPublicApi({
      ...baseOpts,
      toStartTime: "2019-12-31T00:00:00Z",
    });
    expect(page).toEqual({ items: [], cursor: undefined });
    expect(mockQueryClickhouseWithProgress).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "byte estimate",
      scanned: 100_000,
      bytes: 1e9,
      elapsed: 0,
      days: 196,
    },
    {
      name: "client wall time",
      scanned: 100_000,
      bytes: 1e9,
      elapsed: 10_000,
      days: 22.4,
    },
    {
      name: "per-query row target",
      scanned: 2_000_000,
      bytes: 1e9,
      elapsed: 1_000,
      days: 17.5,
    },
    {
      name: "shrinking an expensive window",
      scanned: 100_000,
      bytes: 20e9,
      elapsed: 30_000,
      days: 2.8,
    },
    {
      name: "empty window without progress",
      scanned: undefined,
      bytes: 0,
      elapsed: 0,
      days: 28,
    },
    {
      name: "missing statistics with data",
      scanned: undefined,
      bytes: 0,
      elapsed: 1_000,
      days: 7,
      hasRow: true,
    },
  ])(
    "sizes the next future window using $name",
    async ({ scanned, bytes, elapsed, days, hasRow }) => {
      const clock = vi.spyOn(performance, "now").mockReturnValue(0);
      mockQueryClickhouseWithProgress.mockImplementationOnce(
        async function* () {
          clock.mockReturnValue(elapsed);
          if (scanned !== undefined) yield progressEvent(scanned, bytes);
          if (hasRow)
            yield rowEvent(observation("newest", "2099-12-26 00:00:00.000"));
        },
      );
      mockQueryClickhouseWithProgress.mockImplementationOnce(
        async function* () {
          clock.mockReturnValue(45_000);
          yield rowEvent(observation("future", "2099-12-24 00:00:00.000"));
        },
      );
      const page = await getObservationsV2PageFromEventsTableForPublicApi({
        ...boundedOpts,
        fromStartTime: "1970-01-01T00:00:00Z",
        toStartTime: "2100-01-01T00:00:00Z",
      });
      expect(page.items.map((row) => row.id)).toEqual(
        hasRow ? ["newest", "future"] : ["future"],
      );
      const calls = mockQueryClickhouseWithProgress.mock.calls;
      expect(calls).toHaveLength(2);
      const upper = Date.parse("2099-12-25T00:00:00Z");
      const lower = new Date(upper - days * 86_400_000);
      expect(scanBounds(calls[0][0]).from).toBe("2099-12-25 00:00:00.000");
      expect(scanBounds(calls[1][0]).from).toBe(
        lower.toISOString().replace("T", " ").replace("Z", ""),
      );
      expect(scanBounds(calls[1][0]).to).toBe("2099-12-25 00:00:00.000");
      expect(page.cursor?.lastStartTimeTo).toEqual(lower);
    },
  );

  it("recalibrates after crossing empty history into a byte-heavy window", async () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    mockProgressQuery(progressEvent(0));
    mockQueryClickhouseWithProgress.mockImplementationOnce(async function* () {
      clock.mockReturnValue(12_000);
      yield progressEvent(1_000_000, 40e9);
    });
    mockQueryClickhouseWithProgress.mockImplementationOnce(async function* () {
      clock.mockReturnValue(45_000);
      yield progressEvent(0);
    });
    await getObservationsV2PageFromEventsTableForPublicApi({
      ...baseOpts,
      traceId: "trace-1",
      fromStartTime: "1970-01-01T00:00:00Z",
      toStartTime: "2026-10-19T00:00:00Z",
    });
    const scans = mockQueryClickhouseWithProgress.mock.calls;
    expect(scans).toHaveLength(3);
    expect(
      scans.map(
        ([opts]) =>
          (Date.parse(scanBounds(opts).to.replace(" ", "T") + "Z") -
            Date.parse(scanBounds(opts).from.replace(" ", "T") + "Z")) /
          86_400_000,
      ),
    ).toEqual([7, 28, 14]);
  });

  it.each([
    {
      name: "typed cancellation",
      setup: () => mockProgressError(new ClickHouseQueryAbortedError()),
      assert: (error: unknown) =>
        expect(error).toMatchObject({ errorType: "TIMEOUT" }),
    },
    {
      name: "exception event",
      setup: () => mockProgressQuery({ exception: "Syntax error" }),
      assert: (error: unknown) =>
        expect(error).toMatchObject({ message: "Syntax error" }),
    },
  ])(
    "fails without inventing a continuation when no window completes: $name",
    async ({ setup, assert }) => {
      setup();
      let caught: unknown;
      try {
        await getObservationsV2PageFromEventsTableForPublicApi(boundedOpts);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeDefined();
      assert(caught);
      expect(mockQueryClickhouseWithProgress).toHaveBeenCalledTimes(1);
    },
  );
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
