import { v4 } from "uuid";
import { type QueryType } from "@/src/features/query/types";
import { executeQuery } from "@/src/features/query/server/queryExecutor";
import {
  createOrgProjectAndApiKey,
  createTrace,
  createObservation,
  createEvent,
  createTracesCh,
  createObservationsCh,
  createEventsCh,
  queryClickhouse,
  clickhouseClient,
  type TraceRecordInsertType,
  type ObservationRecordInsertType,
  type EventRecordInsertType,
} from "@langfuse/shared/src/server";
import { getGenerationLikeTypes } from "@langfuse/shared";
import { env } from "@/src/env.mjs";

// Skip when events table is not enabled (v2 queries require events_core).
const maybe =
  env.LANGFUSE_ENABLE_EVENTS_TABLE_V2_APIS === "true"
    ? describe
    : describe.skip;

// ── Constants mirroring packages/shared/scripts/seeder/utils/clickhouse-seed-constants.ts ──

const TRACE_NAMES = [
  "LangGraph",
  "ChatCompletion",
  "DocumentAnalysis",
  "CodeGeneration",
  "DataProcessing",
  "QueryExecution",
];

const GENERATION_NAMES = [
  "ChatOpenAI",
  "GPT-4",
  "Claude-3",
  "Gemini",
  "Mistral",
];

const SPAN_NAMES = ["agent", "tools", "search", "retrieval", "preprocessing"];

const MODELS = [
  "gpt-4o-mini-2024-07-18",
  "gpt-4-turbo-2024-04-09",
  "claude-3-haiku-20240307",
  "claude-3-sonnet-20240229",
  "gemini-pro",
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Deterministic pick from an array using an integer index. */
function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

/**
 * Derive v2 events from v1 traces + observations.
 *
 * Mirrors the logic in dev-tables.sh that populates events from
 * traces/observations: one root event per trace (parent_span_id = ''),
 * plus one event per observation with trace-level fields denormalized.
 */
function buildMatchingEvents(
  traces: TraceRecordInsertType[],
  observations: ObservationRecordInsertType[],
): EventRecordInsertType[] {
  const traceMap = new Map(traces.map((t) => [t.id, t]));
  const events: EventRecordInsertType[] = [];

  // Root events — one per trace.
  for (const t of traces) {
    events.push(
      createEvent({
        id: `t-${t.id}`,
        span_id: `t-${t.id}`,
        trace_id: t.id,
        project_id: t.project_id,
        parent_span_id: "",
        name: t.name ?? "",
        type: "SPAN",
        environment: t.environment,
        trace_name: t.name ?? "",
        user_id: t.user_id ?? "",
        session_id: t.session_id ?? null,
        tags: t.tags ?? [],
        release: t.release ?? null,
        version: t.version ?? null,
        public: t.public,
        bookmarked: t.bookmarked,
        input: t.input ?? null,
        output: t.output ?? null,
        metadata: t.metadata ?? {},
        start_time: t.timestamp * 1000,
        end_time: null,
        cost_details: {},
        provided_cost_details: {},
        usage_details: {},
        provided_usage_details: {},
        created_at: t.created_at * 1000,
        updated_at: t.updated_at * 1000,
        event_ts: t.event_ts * 1000,
      }),
    );
  }

  // Observation events.
  for (const o of observations) {
    const traceId = o.trace_id!;
    const t = traceMap.get(traceId)!;
    events.push(
      createEvent({
        id: o.id,
        span_id: o.id,
        trace_id: traceId,
        project_id: o.project_id,
        // dev-tables.sh: coalesce(parent_observation_id, concat('t-', trace_id))
        parent_span_id: o.parent_observation_id ?? `t-${traceId}`,
        name: o.name ?? "",
        type: o.type as string,
        environment: o.environment,
        trace_name: t.name ?? "",
        user_id: t.user_id ?? "",
        session_id: t.session_id ?? undefined,
        tags: t.tags ?? [],
        release: t.release ?? null,
        version: o.version ?? null,
        level: o.level ?? "DEFAULT",
        status_message: o.status_message ?? null,
        provided_model_name: o.provided_model_name ?? null,
        model_parameters: o.model_parameters ?? "{}",
        input: o.input ?? null,
        output: o.output ?? null,
        // dev-tables.sh: mapConcat(obs.metadata, trace.metadata)
        metadata: { ...(t.metadata ?? {}), ...(o.metadata ?? {}) },
        provided_usage_details: o.provided_usage_details ?? {},
        usage_details: o.usage_details ?? {},
        provided_cost_details: o.provided_cost_details ?? {},
        cost_details: o.cost_details ?? {},
        prompt_id: o.prompt_id ?? null,
        prompt_name: o.prompt_name ?? null,
        prompt_version: o.prompt_version ? String(o.prompt_version) : null,
        tool_definitions: o.tool_definitions ?? {},
        tool_calls: o.tool_calls ?? [],
        tool_call_names: o.tool_call_names ?? [],
        start_time: o.start_time * 1000,
        end_time: o.end_time ? o.end_time * 1000 : null,
        completion_start_time: o.completion_start_time
          ? o.completion_start_time * 1000
          : null,
        created_at: o.created_at * 1000,
        updated_at: o.updated_at * 1000,
        event_ts: o.event_ts * 1000,
      }),
    );
  }

  return events;
}

// ── Data mode toggle ─────────────────────────────────────────────────────────
// "synthetic" — generates isolated data from scratch (safe for parallel CI).
// "seeder"    — copies real seed data into an isolated project (richer data,
//               but the seed project must already be populated and not yet
//               contaminated by other tests in the same run).
type DataMode = "synthetic" | "seeder";
const DATA_MODE = "synthetic" as DataMode;

const SEED_PROJECT_ID = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

// ── Seeder mode: copy seed data into an isolated project ─────────────────────

async function seedFromSeeder(targetProjectId: string) {
  const client = clickhouseClient();
  for (const table of ["traces", "observations", "events"]) {
    try {
      await client.command({
        query: `INSERT INTO ${table} SELECT * REPLACE({newProjectId: String} AS project_id) FROM ${table} FINAL WHERE project_id = {seedProjectId: String}`,
        query_params: {
          seedProjectId: SEED_PROJECT_ID,
          newProjectId: targetProjectId,
        },
      });
    } catch {
      // events table may not exist when v2 APIs are disabled
    }
  }

  const maxTsResult = await queryClickhouse<{ max_ts: string }>({
    query: `SELECT max(timestamp) as max_ts FROM traces WHERE project_id = {projectId: String}`,
    params: { projectId: targetProjectId },
  });
  const maxTs = new Date(maxTsResult[0]?.max_ts ?? Date.now());

  let maxTsEvents = new Date(0);
  if (env.LANGFUSE_ENABLE_EVENTS_TABLE_V2_APIS === "true") {
    const maxTsEventsResult = await queryClickhouse<{ max_ts: string }>({
      query: `SELECT max(event_ts) as max_ts FROM events_core WHERE project_id = {projectId: String}`,
      params: { projectId: targetProjectId },
    });
    maxTsEvents = new Date(maxTsEventsResult[0]?.max_ts ?? Date.now());
  }

  const effectiveMax =
    maxTs.getTime() > maxTsEvents.getTime() ? maxTs : maxTsEvents;

  return {
    toTimestamp: new Date(
      effectiveMax.getTime() + 60 * 60 * 1000,
    ).toISOString(),
    fromTimestamp1d: new Date(
      effectiveMax.getTime() - 24 * 60 * 60 * 1000,
    ).toISOString(),
    fromTimestamp7d: new Date(
      effectiveMax.getTime() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString(),
  };
}

// ── Synthetic mode: build data from scratch ──────────────────────────────────

async function seedSynthetic(targetProjectId: string) {
  const baseTime = new Date("2024-06-15T12:00:00Z").getTime();
  const TRACE_COUNT = 20;
  const OBS_PER_TRACE = 5;

  const traces: TraceRecordInsertType[] = [];
  const observations: ObservationRecordInsertType[] = [];

  for (let ti = 0; ti < TRACE_COUNT; ti++) {
    const traceId = v4();
    const traceName = pick(TRACE_NAMES, ti);
    const userId = ti % 3 === 0 ? `user_${(ti % 10) + 1}` : null;
    const sessionId = ti % 4 === 0 ? `session_${(ti % 5) + 1}` : null;
    const dayOffset = Math.floor(ti / 7);
    const traceTs = baseTime - dayOffset * 24 * 60 * 60 * 1000 + ti * 60_000;

    traces.push(
      createTrace({
        id: traceId,
        project_id: targetProjectId,
        name: traceName,
        user_id: userId,
        session_id: sessionId,
        timestamp: traceTs,
        environment: "default",
        tags: ti % 3 === 0 ? ["production", "ai-agent"] : [],
        release: ti % 4 === 0 ? `v1.${ti % 10}` : null,
        version: ti % 5 === 0 ? `v2.${ti % 20}` : null,
        metadata: { generated: "synthetic", traceIndex: String(ti) },
        created_at: traceTs,
        updated_at: traceTs,
        event_ts: traceTs,
      }),
    );

    let prevObsId: string | undefined;
    for (let oi = 0; oi < OBS_PER_TRACE; oi++) {
      const obsId = v4();
      const obsTypes = [
        "GENERATION",
        "SPAN",
        "GENERATION",
        "TOOL",
        "GENERATION",
      ] as const;
      const obsType = obsTypes[oi % obsTypes.length];

      const isGeneration = obsType === "GENERATION";
      const obsName = isGeneration
        ? pick(GENERATION_NAMES, ti * OBS_PER_TRACE + oi)
        : pick(SPAN_NAMES, ti * OBS_PER_TRACE + oi);
      const modelName = isGeneration
        ? pick(MODELS, ti * OBS_PER_TRACE + oi)
        : null;

      const obsStart = traceTs + 100 + oi * 500;
      const latencyMs = 200 + ((ti * OBS_PER_TRACE + oi) % 20) * 100;
      const obsEnd = obsStart + latencyMs;

      const inputTokens = isGeneration ? 50 + ti * 10 + oi * 5 : 0;
      const outputTokens = isGeneration ? 30 + ti * 5 + oi * 3 : 0;
      const totalTokens = inputTokens + outputTokens;
      const inputCost = isGeneration ? inputTokens / 1_000_000 : 0;
      const outputCost = isGeneration ? outputTokens / 500_000 : 0;
      const totalCost = inputCost + outputCost;

      observations.push(
        createObservation({
          id: obsId,
          trace_id: traceId,
          project_id: targetProjectId,
          parent_observation_id: prevObsId ?? undefined,
          type: obsType,
          name: obsName,
          start_time: obsStart,
          end_time: obsEnd,
          provided_model_name: modelName,
          model_parameters: isGeneration
            ? JSON.stringify({ temperature: 0.7 })
            : null,
          total_cost: isGeneration ? totalCost : null,
          cost_details: isGeneration ? { total: totalCost } : {},
          provided_cost_details: isGeneration ? { total: totalCost } : {},
          usage_details: isGeneration ? { total: totalTokens } : {},
          provided_usage_details: isGeneration ? { total: totalTokens } : {},
          level: "DEFAULT",
          environment: "default",
          metadata: { generated: "synthetic" },
          created_at: obsStart,
          updated_at: obsEnd,
          event_ts: obsEnd,
        }),
      );

      prevObsId = obsId;
    }
  }

  const events = buildMatchingEvents(traces, observations);

  await Promise.all([
    createTracesCh(traces),
    createObservationsCh(observations),
    createEventsCh(events),
  ]);

  return {
    toTimestamp: new Date(baseTime + 60 * 60 * 1000).toISOString(),
    fromTimestamp1d: new Date(baseTime - 24 * 60 * 60 * 1000).toISOString(),
    fromTimestamp7d: new Date(baseTime - 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Dashboard v1 vs v2 consistency tests.
 *
 * Seeds an isolated project then runs the same dashboard queries via both
 * v1 (traces/observations tables) and v2 (events_core table) code-paths.
 *
 * Two data modes (toggle via DATA_MODE):
 * - "synthetic": generates data from scratch — safe for parallel CI.
 * - "seeder":    copies real seed data — richer, but requires the seed project
 *                to be populated before the test suite starts.
 */
describe("dashboard v1 vs v2 consistency", () => {
  it("should not hang redis when events table is disabled", () => {
    // At least one test case must run to avoid hanging the redis connection
    // when everything else is skipped via `maybe`.
  });

  let projectId: string;

  let fromTimestamp1d: string;
  let fromTimestamp7d: string;
  let toTimestamp: string;

  beforeAll(async () => {
    if (env.LANGFUSE_ENABLE_EVENTS_TABLE_V2_APIS !== "true") return;

    const org = await createOrgProjectAndApiKey();
    projectId = org.projectId;

    const timestamps =
      DATA_MODE === "seeder"
        ? await seedFromSeeder(projectId)
        : await seedSynthetic(projectId);

    fromTimestamp1d = timestamps.fromTimestamp1d;
    fromTimestamp7d = timestamps.fromTimestamp7d;
    toTimestamp = timestamps.toTimestamp;
  });

  function fromFor(window: "1d" | "7d") {
    return window === "1d" ? fromTimestamp1d : fromTimestamp7d;
  }

  async function runBothVersions(query: QueryType): Promise<{
    v1: Array<Record<string, unknown>>;
    v2: Array<Record<string, unknown>>;
  }> {
    const [v1, v2] = await Promise.all([
      executeQuery(projectId, query, "v1"),
      executeQuery(projectId, query, "v2"),
    ]);
    return { v1, v2 };
  }

  /**
   * Build a map from a key field to the full row.
   * If duplicate keys exist, later rows silently overwrite earlier ones.
   * This is fine for GROUP BY results where name/userId are unique per group.
   */
  function toMap(
    rows: Array<Record<string, unknown>>,
    keyField: string,
  ): Map<string, Record<string, unknown>> {
    const map = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      map.set(String(row[keyField] ?? ""), row);
    }
    return map;
  }

  /** Assert v2 count is within a relative tolerance of v1 count. */
  function expectWithinFactor(v1Val: number, v2Val: number, maxFactor: number) {
    const ratio = v1Val > 0 ? v2Val / v1Val : v2Val === 0 ? 1 : Infinity;
    expect(ratio).toBeGreaterThan(1 / maxFactor);
    expect(ratio).toBeLessThan(maxFactor);
  }

  /** Run both versions and assert total count_count matches exactly. */
  async function expectExactTotalCount(query: QueryType) {
    const { v1, v2 } = await runBothVersions(query);
    const sum = (rows: Array<Record<string, unknown>>) =>
      rows.reduce((s, r) => s + Number(r.count_count), 0);
    expect(sum(v1)).toBe(sum(v2));
  }

  /** Run both versions and assert per-key count_count matches exactly. */
  async function expectExactGroupedCounts(query: QueryType, keyField: string) {
    const { v1, v2 } = await runBothVersions(query);
    const v1Map = toMap(v1, keyField);
    const v2Map = toMap(v2, keyField);

    expect(v1Map.size).toBe(v2Map.size);
    for (const [key, v1Row] of v1Map) {
      const v2Row = v2Map.get(key);
      expect(v2Row).toBeDefined();
      expect(Number(v1Row.count_count)).toBe(Number(v2Row!.count_count));
    }
  }

  // ─── 1. Traces tile - total count ──────────────────────────────────────

  maybe("traces total count", () => {
    it.each(["1d", "7d"] as const)(
      "should match exactly for %s window",
      async (window) => {
        await expectExactTotalCount({
          view: "traces",
          dimensions: [],
          metrics: [{ measure: "count", aggregation: "count" }],
          timeDimension: null,
          filters: [],
          orderBy: null,
          fromTimestamp: fromFor(window),
          toTimestamp,
        });
      },
    );
  });

  // ─── 2. Traces grouped by name ─────────────────────────────────────────

  maybe("traces grouped by name", () => {
    it.each(["1d", "7d"] as const)(
      "should match exactly for %s window",
      async (window) => {
        await expectExactGroupedCounts(
          {
            view: "traces",
            dimensions: [{ field: "name" }],
            metrics: [{ measure: "count", aggregation: "count" }],
            timeDimension: null,
            filters: [],
            orderBy: null,
            fromTimestamp: fromFor(window),
            toTimestamp,
          },
          "name",
        );
      },
    );
  });

  // ─── 3. Traces time series ─────────────────────────────────────────────

  maybe("traces by time (day granularity)", () => {
    it.each(["1d", "7d"] as const)(
      "should have matching per-bucket counts for %s window",
      async (window) => {
        const query: QueryType = {
          view: "traces",
          dimensions: [],
          metrics: [{ measure: "count", aggregation: "count" }],
          timeDimension: { granularity: "day" },
          filters: [],
          orderBy: null,
          fromTimestamp: fromFor(window),
          toTimestamp,
        };
        const { v1, v2 } = await runBothVersions(query);

        // Total must match (existing invariant)
        const sum = (rows: Array<Record<string, unknown>>) =>
          rows.reduce((s, r) => s + Number(r.count_count), 0);
        expect(sum(v2)).toBe(sum(v1));

        // Per-bucket counts must also match exactly.
        // A mismatch here indicates traces are being assigned to wrong time
        // buckets in v2 (e.g. due to using min(start_time) across all events
        // instead of only the root event's timestamp).
        const v1Map = toMap(
          v1.filter((r) => Number(r.count_count) > 0),
          "time_dimension",
        );
        const v2Map = toMap(
          v2.filter((r) => Number(r.count_count) > 0),
          "time_dimension",
        );

        expect(v2Map.size).toBe(v1Map.size);
        for (const [ts, v1Row] of v1Map) {
          const v2Row = v2Map.get(ts);
          expect(v2Row).toBeDefined();
          expect(Number(v2Row!.count_count)).toBe(Number(v1Row.count_count));
        }
      },
    );
  });

  // ─── 4. User consumption - Token cost tab ──────────────────────────────

  maybe("user consumption - token cost", () => {
    function buildTokenCostQuery(from: string): QueryType {
      return {
        view: "observations",
        dimensions: [{ field: "userId" }],
        metrics: [
          { measure: "totalCost", aggregation: "sum" },
          { measure: "count", aggregation: "count" },
        ],
        filters: [
          {
            column: "type",
            operator: "any of",
            value: getGenerationLikeTypes(),
            type: "stringOptions",
          },
        ],
        timeDimension: null,
        // userId is high-cardinality in v2, so we need orderBy + row_limit
        orderBy: [{ field: "sum_totalCost", direction: "desc" }],
        chartConfig: { type: "table", row_limit: 100 },
        fromTimestamp: from,
        toTimestamp,
      };
    }

    it("should return matching counts for shared users in 7d window", async () => {
      const { v1, v2 } = await runBothVersions(
        buildTokenCostQuery(fromTimestamp7d),
      );

      // v1 gets userId via LEFT JOIN traces (traces.user_id), v2 uses
      // denormalized user_id from events_core. Some users may appear in
      // one but not the other due to denormalization gaps.
      const v1Map = toMap(v1, "userId");
      const v2Map = toMap(v2, "userId");

      const sharedUsers = [...v1Map.keys()].filter((u) => v2Map.has(u));
      expect(sharedUsers.length).toBeGreaterThan(0);

      for (const userId of sharedUsers) {
        const v1Row = v1Map.get(userId)!;
        const v2Row = v2Map.get(userId)!;
        expect(Number(v1Row.count_count)).toBe(Number(v2Row.count_count));
      }
    });

    it("should have overlapping users with counts within 3x for 1d window", async () => {
      const { v1, v2 } = await runBothVersions(
        buildTokenCostQuery(fromTimestamp1d),
      );

      const v1Map = toMap(v1, "userId");
      const v2Map = toMap(v2, "userId");

      // Two compounding sources of divergence in the 1d window:
      // 1. Time filter: v1 filters observations.start_time, v2 filters
      //    events_core.start_time (which also includes root-event rows, shifting
      //    the effective boundary for which observations are included).
      // 2. userId source: v1 LEFT JOINs the traces table for traces.user_id,
      //    v2 reads the denormalized user_id column on events_core. Observations
      //    whose trace has a user_id but whose event row has an empty user_id
      //    (or vice versa) appear under different keys.
      // Together these reduce user overlap to ~30% in the 1d window.
      const sharedUsers = [...v1Map.keys()].filter((u) => v2Map.has(u));
      expect(sharedUsers.length / v1Map.size).toBeGreaterThan(0.25);

      // For shared users, aggregate counts still track within 3x.
      const v1TotalCount = sharedUsers.reduce(
        (s, u) => s + Number(v1Map.get(u)!.count_count),
        0,
      );
      const v2TotalCount = sharedUsers.reduce(
        (s, u) => s + Number(v2Map.get(u)!.count_count),
        0,
      );
      expectWithinFactor(v1TotalCount, v2TotalCount, 3);
    });
  });

  // ─── 5. User consumption - count of traces ─────────────────────────────

  maybe("user consumption - trace count", () => {
    it.each(["1d", "7d"] as const)(
      "should match exactly for %s window",
      async (window) => {
        await expectExactGroupedCounts(
          {
            view: "traces",
            dimensions: [{ field: "userId" }],
            metrics: [{ measure: "count", aggregation: "count" }],
            timeDimension: null,
            filters: [],
            orderBy: [{ field: "count_count", direction: "desc" }],
            chartConfig: { type: "table", row_limit: 100 },
            fromTimestamp: fromFor(window),
            toTimestamp,
          },
          "userId",
        );
      },
    );
  });

  // ─── 6. Trace latency percentiles ──────────────────────────────────────

  maybe("trace latency percentiles", () => {
    it.each(["1d", "7d"] as const)(
      "should return matching percentiles for shared names in %s window",
      async (window) => {
        const query: QueryType = {
          view: "traces",
          dimensions: [{ field: "name" }],
          metrics: [
            { measure: "latency", aggregation: "p50" },
            { measure: "latency", aggregation: "p90" },
            { measure: "latency", aggregation: "p95" },
            { measure: "latency", aggregation: "p99" },
          ],
          timeDimension: null,
          filters: [],
          orderBy: [{ field: "p95_latency", direction: "desc" }],
          fromTimestamp: fromFor(window),
          toTimestamp,
        };

        const { v1, v2 } = await runBothVersions(query);

        const v1Map = toMap(v1, "name");
        const v2Map = toMap(v2, "name");

        // Different trace sets (due to time filter) produce slightly different
        // name groups. In the 7d window the gap is ~3 names out of ~480 (<1%).
        // Allow up to 5%.
        expect(Math.abs(v1Map.size - v2Map.size)).toBeLessThan(
          Math.max(v1Map.size, v2Map.size) * 0.05,
        );

        // For names present in both, latency percentiles should be within 10%.
        // Small differences arise because v2 may include/exclude a few
        // observations per trace (boundary events), slightly shifting quantiles.
        for (const [name, v1Row] of v1Map) {
          const v2Row = v2Map.get(name);
          if (!v2Row) continue;

          for (const metric of [
            "p50_latency",
            "p90_latency",
            "p95_latency",
            "p99_latency",
          ]) {
            const v1Val = Number(v1Row[metric]);
            const v2Val = Number(v2Row[metric]);

            if (v1Val === 0 && v2Val === 0) continue;

            const maxVal = Math.max(Math.abs(v1Val), Math.abs(v2Val));
            const diff = Math.abs(v1Val - v2Val);
            const relDiff = maxVal > 0 ? diff / maxVal : 0;

            expect(relDiff).toBeLessThan(0.1);
          }
        }
      },
    );
  });
});
