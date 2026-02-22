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
  createTraceScore,
  createScoresCh,
  queryClickhouse,
  clickhouseClient,
  type TraceRecordInsertType,
  type ObservationRecordInsertType,
  type EventRecordInsertType,
  type ScoreRecordInsertType,
} from "@langfuse/shared/src/server";
import { getGenerationLikeTypes, type FilterCondition } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import type { Session } from "next-auth";
import { env } from "@/src/env.mjs";
import { type DatabaseRow } from "@/src/server/api/services/sqlInterface";

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
  for (const table of ["traces", "observations", "events", "scores"]) {
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

  // Build scores: 3 per trace (NUMERIC, BOOLEAN, CATEGORICAL) = 60 total
  const SCORE_NAMES = ["accuracy", "relevance", "helpful"];
  const scores: ScoreRecordInsertType[] = [];

  for (let ti = 0; ti < TRACE_COUNT; ti++) {
    const trace = traces[ti];
    const traceTs =
      baseTime - Math.floor(ti / 7) * 24 * 60 * 60 * 1000 + ti * 60_000 + 200;

    // First 10 traces → "default", last 10 → "staging"
    const scoreEnv = ti < 10 ? "default" : "staging";

    // NUMERIC score — value varies: 0, 0.25, 0.5, 0.75, 0.9, 1
    const numericValues = [0, 0.25, 0.5, 0.75, 0.9, 1];
    scores.push(
      createTraceScore({
        project_id: targetProjectId,
        trace_id: trace.id,
        name: SCORE_NAMES[0],
        source: "API",
        data_type: "NUMERIC",
        value: numericValues[ti % numericValues.length],
        string_value: null,
        timestamp: traceTs,
        environment: scoreEnv,
        created_at: traceTs,
        updated_at: traceTs,
        event_ts: traceTs,
      }),
    );

    // BOOLEAN score — value is 0 or 1
    scores.push(
      createTraceScore({
        project_id: targetProjectId,
        trace_id: trace.id,
        name: SCORE_NAMES[1],
        source: "API",
        data_type: "BOOLEAN",
        value: ti % 2,
        string_value: null,
        timestamp: traceTs,
        environment: scoreEnv,
        created_at: traceTs,
        updated_at: traceTs,
        event_ts: traceTs,
      }),
    );

    // CATEGORICAL score — value is 0, string_value is set
    const categories = ["good", "bad", "neutral"];
    scores.push(
      createTraceScore({
        project_id: targetProjectId,
        trace_id: trace.id,
        name: SCORE_NAMES[2],
        source: "ANNOTATION",
        data_type: "CATEGORICAL",
        value: 0,
        string_value: categories[ti % categories.length],
        timestamp: traceTs,
        environment: scoreEnv,
        created_at: traceTs,
        updated_at: traceTs,
        event_ts: traceTs,
      }),
    );
  }

  await Promise.all([
    createTracesCh(traces),
    createObservationsCh(observations),
    createEventsCh(events),
    createScoresCh(scores),
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
  let orgId: string;

  let fromTimestamp1d: string;
  let fromTimestamp7d: string;
  let toTimestamp: string;

  beforeAll(async () => {
    if (env.LANGFUSE_ENABLE_EVENTS_TABLE_V2_APIS !== "true") return;

    const org = await createOrgProjectAndApiKey();
    projectId = org.projectId;
    orgId = org.orgId;

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

  function makeCaller() {
    const session: Session = {
      expires: "1",
      user: {
        id: "user-1",
        canCreateOrganizations: true,
        name: "Test User",
        organizations: [
          {
            id: orgId,
            name: "Test Organization",
            role: "OWNER",
            plan: "cloud:hobby",
            cloudConfig: undefined,
            metadata: {},
            aiFeaturesEnabled: false,
            projects: [
              {
                id: projectId,
                role: "ADMIN",
                retentionDays: 30,
                deletedAt: null,
                name: "Test Project",
                hasTraces: true,
                metadata: {},
              },
            ],
          },
        ],
        featureFlags: {
          excludeClickhouseRead: false,
          templateFlag: true,
          v4BetaToggleVisible: false,
          observationEvals: false,
        },
        admin: true,
      },
      environment: {} as any,
    };
    const ctx = createInnerTRPCContext({ session, headers: {} });
    return appRouter.createCaller({ ...ctx, prisma });
  }

  async function runBothVersions(query: QueryType): Promise<{
    v1: Array<Record<string, unknown>>;
    v2: Array<Record<string, unknown>>;
  }> {
    const [v1, v2] = await Promise.all([
      executeQuery(projectId, query, "v1"),
      executeQuery(projectId, query, "v2", true),
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

  // ─── 7. Score-aggregate tRPC endpoint (full getScoreAggregateV2 path) ─

  // Synthetic data seeds environments "default" and "staging" explicitly.
  // Seeder data uses "default" and "langfuse-prompt-experiment" for scores
  // (see data-generators.ts lines 240, 268, 600 and clickhouse-builder.ts).
  const SCORE_ENVIRONMENTS =
    DATA_MODE === "seeder"
      ? ["default", "langfuse-prompt-experiment"]
      : ["default", "staging"];

  maybe("score-aggregate tRPC endpoint v2", () => {
    const chartInput = (
      version: "v1" | "v2",
      extraFilters: FilterCondition[] = [],
    ) => ({
      projectId,
      from: "traces_scores" as const,
      select: [
        { column: "scoreName" },
        { column: "scoreId", agg: "COUNT" as const },
        { column: "value", agg: "AVG" as const },
        { column: "scoreSource" },
        { column: "scoreDataType" },
      ],
      filter: [
        {
          column: "scoreTimestamp",
          operator: ">=" as const,
          value: new Date(fromTimestamp7d),
          type: "datetime" as const,
        },
        {
          column: "scoreTimestamp",
          operator: "<" as const,
          value: new Date(toTimestamp),
          type: "datetime" as const,
        },
        ...extraFilters,
      ],
      groupBy: [
        { type: "string" as const, column: "scoreName" },
        { type: "string" as const, column: "scoreSource" },
        { type: "string" as const, column: "scoreDataType" },
      ],
      orderBy: [
        {
          column: "scoreId",
          direction: "DESC" as const,
          agg: "COUNT" as const,
        },
      ],
      queryName: "score-aggregate" as const,
      version,
    });

    it("should return data with expected field names", async () => {
      const caller = makeCaller();
      const result = await caller.dashboard.chart(chartInput("v2"));

      expect(result.length).toBeGreaterThan(0);
      // Verify field renaming: v2 maps name→scoreName, source→scoreSource, etc.
      for (const row of result) {
        expect(row).toHaveProperty("scoreName");
        expect(row).toHaveProperty("scoreSource");
        expect(row).toHaveProperty("scoreDataType");
        expect(row).toHaveProperty("countScoreId");
        expect(row).toHaveProperty("avgValue");
        // Should NOT have raw v2 field names
        expect(row).not.toHaveProperty("name");
        expect(row).not.toHaveProperty("source");
        expect(row).not.toHaveProperty("sum_count");
      }
    });

    it("should return matching counts, avgValue, and order between v1 and v2", async () => {
      const caller = makeCaller();
      const [v1Result, v2Result] = await Promise.all([
        caller.dashboard.chart(chartInput("v1")),
        caller.dashboard.chart(chartInput("v2")),
      ]);

      expect(v1Result.length).toBeGreaterThan(0);
      expect(v1Result.length).toBe(v2Result.length);

      // Check order: both should be sorted by countScoreId DESC
      for (let i = 1; i < v1Result.length; i++) {
        expect(Number(v1Result[i - 1].countScoreId)).toBeGreaterThanOrEqual(
          Number(v1Result[i].countScoreId),
        );
      }
      for (let i = 1; i < v2Result.length; i++) {
        expect(Number(v2Result[i - 1].countScoreId)).toBeGreaterThanOrEqual(
          Number(v2Result[i].countScoreId),
        );
      }

      const toKey = (r: Record<string, unknown>) =>
        `${r.scoreName}|${r.scoreSource}|${r.scoreDataType}`;
      const v1Map = new Map(v1Result.map((r) => [toKey(r), r]));
      const v2Map = new Map(v2Result.map((r) => [toKey(r), r]));

      for (const [key, v1Row] of v1Map) {
        const v2Row = v2Map.get(key);
        expect(v2Row).toBeDefined();
        // countScoreId must match exactly
        expect(Number(v2Row!.countScoreId)).toBe(Number(v1Row.countScoreId));
        // avgValue must match (both should be numeric)
        expect(Number(v2Row!.avgValue)).toBeCloseTo(Number(v1Row.avgValue), 5);
        // avgValue type: v2 returns number, v1 returns string from ClickHouse.
        // Component uses: metric.avgValue ? (metric.avgValue as number) : 0
        // Verify v2 avgValue behaves correctly with the truthiness guard
        const v2Avg = v2Row!.avgValue;
        expect(typeof v2Avg).toBe("number");
      }
    });

    it("should handle value=0 filter correctly", async () => {
      const caller = makeCaller();
      const zeroFilter: FilterCondition[] = [
        {
          column: "value",
          operator: "=" as const,
          value: 0,
          type: "number" as const,
        },
      ];
      const [v1Result, v2Result] = await Promise.all([
        caller.dashboard.chart(chartInput("v1", zeroFilter)),
        caller.dashboard.chart(chartInput("v2", zeroFilter)),
      ]);

      expect(v1Result.length).toBe(v2Result.length);

      const toKey = (r: Record<string, unknown>) =>
        `${r.scoreName}|${r.scoreSource}|${r.scoreDataType}`;
      const v1Map = new Map(v1Result.map((r) => [toKey(r), r]));
      const v2Map = new Map(v2Result.map((r) => [toKey(r), r]));

      for (const [key, v1Row] of v1Map) {
        const v2Row = v2Map.get(key);
        expect(v2Row).toBeDefined();
        expect(Number(v2Row!.countScoreId)).toBe(Number(v1Row.countScoreId));
      }
    });

    it("should produce identical joined table data (simulating ScoresTable component)", async () => {
      const caller = makeCaller();
      const valueFilter = (v: number): FilterCondition[] => [
        {
          column: "value",
          operator: "=" as const,
          value: v,
          type: "number" as const,
        },
      ];

      // Run all 3 queries for both versions (mirroring ScoresTable component)
      const [v1Main, v1Zero, v1One, v2Main, v2Zero, v2One] = await Promise.all([
        caller.dashboard.chart(chartInput("v1")),
        caller.dashboard.chart(chartInput("v1", valueFilter(0))),
        caller.dashboard.chart(chartInput("v1", valueFilter(1))),
        caller.dashboard.chart(chartInput("v2")),
        caller.dashboard.chart(chartInput("v2", valueFilter(0))),
        caller.dashboard.chart(chartInput("v2", valueFilter(1))),
      ]);

      // Simulate joinRequestData from ScoresTable component
      const joinData = (
        main: Record<string, unknown>[],
        zero: Record<string, unknown>[],
        one: Record<string, unknown>[],
      ) =>
        main.map((metric) => {
          const scoreName = metric.scoreName as string;
          const scoreSource = metric.scoreSource as string;
          const scoreDataType = metric.scoreDataType as string;
          const match = (item: Record<string, unknown>) =>
            item.scoreName === scoreName &&
            item.scoreSource === scoreSource &&
            item.scoreDataType === scoreDataType;
          const zeroRow = zero.find(match);
          const oneRow = one.find(match);
          return {
            scoreName,
            scoreSource,
            scoreDataType,
            countScoreId: metric.countScoreId ? Number(metric.countScoreId) : 0,
            avgValue: metric.avgValue ? Number(metric.avgValue) : 0,
            zeroValueScore: zeroRow?.countScoreId
              ? Number(zeroRow.countScoreId)
              : 0,
            oneValueScore: oneRow?.countScoreId
              ? Number(oneRow.countScoreId)
              : 0,
          };
        });

      const v1Data = joinData(v1Main, v1Zero, v1One);
      const v2Data = joinData(v2Main, v2Zero, v2One);

      expect(v2Data.length).toBe(v1Data.length);

      // Compare by key (order may differ due to tie-breaking)
      const toKey = (r: {
        scoreName: string;
        scoreSource: string;
        scoreDataType: string;
      }) => `${r.scoreName}|${r.scoreSource}|${r.scoreDataType}`;
      const v1Map = new Map(v1Data.map((r) => [toKey(r), r]));
      const v2Map = new Map(v2Data.map((r) => [toKey(r), r]));

      for (const [key, v1Row] of v1Map) {
        const v2Row = v2Map.get(key);
        expect(v2Row).toBeDefined();
        expect(v2Row!.countScoreId).toBe(v1Row.countScoreId);
        expect(v2Row!.avgValue).toBeCloseTo(v1Row.avgValue, 5);
        expect(v2Row!.zeroValueScore).toBe(v1Row.zeroValueScore);
        expect(v2Row!.oneValueScore).toBe(v1Row.oneValueScore);
      }

      // Verify ordering matches: both sorted by countScoreId DESC
      expect(v2Data.map((r) => r.countScoreId)).toEqual(
        v1Data.map((r) => r.countScoreId),
      );
    });

    it("should return matching results when environment filter is applied", async () => {
      const caller = makeCaller();

      for (const env of SCORE_ENVIRONMENTS) {
        const envFilter: FilterCondition[] = [
          {
            column: "Environment",
            operator: "=" as const,
            value: env,
            type: "string" as const,
          },
        ];

        const [v1Result, v2Result] = await Promise.all([
          caller.dashboard.chart(chartInput("v1", envFilter)),
          caller.dashboard.chart(chartInput("v2", envFilter)),
        ]);

        // Both should return data
        expect(v1Result.length).toBeGreaterThan(0);
        expect(v2Result.length).toBeGreaterThan(0);

        const toKey = (r: Record<string, unknown>) =>
          `${r.scoreName}|${r.scoreSource}|${r.scoreDataType}`;
        const v1Map = new Map(v1Result.map((r) => [toKey(r), r]));
        const v2Map = new Map(v2Result.map((r) => [toKey(r), r]));

        // v2 must contain every key v1 returns, and their counts/averages must agree.
        // v2 may return additional rows for scores where score.environment ≠ parent
        // trace.environment: v1 joins traces and applies the environment filter on
        // t.environment, while v2 filters directly on scores.environment — which is
        // more accurate but may include scores v1 silently drops.
        for (const [key, v1Row] of v1Map) {
          const v2Row = v2Map.get(key);
          expect(v2Row).toBeDefined();
          expect(Number(v2Row!.countScoreId)).toBe(Number(v1Row.countScoreId));
          expect(Number(v2Row!.avgValue)).toBeCloseTo(
            Number(v1Row.avgValue),
            5,
          );
        }

        // Filtered counts should be less than unfiltered
        const unfilteredResult = await caller.dashboard.chart(chartInput("v2"));
        const unfilteredTotal = unfilteredResult.reduce(
          (s, r) => s + Number(r.countScoreId),
          0,
        );
        const filteredTotal = v2Result.reduce(
          (s, r) => s + Number(r.countScoreId),
          0,
        );
        expect(filteredTotal).toBeLessThan(unfilteredTotal);
      }
    });
  });

  // ─── 8. ScoreHistogram tRPC endpoint (v2 via executeQuery histogram) ──

  // Seed data uses "metric_*" names; synthetic data uses "accuracy"/"relevance".
  const HIST_NUMERIC =
    DATA_MODE === "seeder"
      ? { name: "metric_46", source: "API", dataType: "NUMERIC" }
      : { name: "accuracy", source: "API", dataType: "NUMERIC" };
  const HIST_BOOLEAN =
    DATA_MODE === "seeder"
      ? { name: "metric_32", source: "API", dataType: "BOOLEAN" }
      : { name: "relevance", source: "API", dataType: "BOOLEAN" };

  maybe("scoreHistogram tRPC endpoint v2", () => {
    const histInput = (
      version: "v1" | "v2",
      scoreName: string,
      scoreSource: string,
      scoreDataType: string,
    ) => ({
      projectId,
      from: "traces_scores" as const,
      select: [{ column: "value" }],
      filter: [
        {
          column: "scoreTimestamp",
          operator: ">=" as const,
          value: new Date(fromTimestamp7d),
          type: "datetime" as const,
        },
        {
          column: "scoreTimestamp",
          operator: "<" as const,
          value: new Date(toTimestamp),
          type: "datetime" as const,
        },
        {
          type: "string" as const,
          column: "scoreName",
          value: scoreName,
          operator: "=" as const,
        },
        {
          type: "string" as const,
          column: "scoreSource",
          value: scoreSource,
          operator: "=" as const,
        },
        {
          type: "string" as const,
          column: "scoreDataType",
          value: scoreDataType,
          operator: "=" as const,
        },
      ],
      limit: 10000,
      version,
    });

    /**
     * Parse histogram bins into (lower, upper, count) tuples.
     * Bin labels follow the format "[lower, upper]".
     */
    function parseBins(
      chartData: Array<Record<string, unknown>>,
    ): Array<{ lower: number; upper: number; count: number }> {
      return chartData.map((bin) => {
        const match = (bin.binLabel as string).match(
          /\[(-?[\d.]+),\s*(-?[\d.]+)\]/,
        );
        expect(match).not.toBeNull();
        return {
          lower: Number(match![1]),
          upper: Number(match![2]),
          count: Number((bin as Record<string, number>).count ?? 0),
        };
      });
    }

    /**
     * Sum bin counts whose midpoint falls below each threshold.
     */
    function cumulativeCountsAt(
      bins: Array<{ lower: number; upper: number; count: number }>,
      thresholds: number[],
    ): number[] {
      return thresholds.map((t) =>
        bins
          .filter((b) => (b.lower + b.upper) / 2 < t)
          .reduce((s, b) => s + b.count, 0),
      );
    }

    it("should return valid histogram data for v2", async () => {
      const caller = makeCaller();
      const result = await caller.dashboard.scoreHistogram(
        histInput(
          "v2",
          HIST_NUMERIC.name,
          HIST_NUMERIC.source,
          HIST_NUMERIC.dataType,
        ),
      );

      expect(result.chartLabels).toEqual(["count"]);
      expect(result.chartData.length).toBeGreaterThan(0);

      // Each bin should have binLabel and count
      for (const bin of result.chartData) {
        expect(bin).toHaveProperty("binLabel");
        expect(bin).toHaveProperty("count");
        expect(typeof bin.count).toBe("number");
        expect(bin.count).toBeGreaterThanOrEqual(0);
      }
    });

    it("should return matching histogram shape between v1 and v2 for NUMERIC scores", async () => {
      const caller = makeCaller();
      const [v1Result, v2Result] = await Promise.all([
        caller.dashboard.scoreHistogram(
          histInput(
            "v1",
            HIST_NUMERIC.name,
            HIST_NUMERIC.source,
            HIST_NUMERIC.dataType,
          ),
        ),
        caller.dashboard.scoreHistogram(
          histInput(
            "v2",
            HIST_NUMERIC.name,
            HIST_NUMERIC.source,
            HIST_NUMERIC.dataType,
          ),
        ),
      ]);

      expect(v1Result.chartData.length).toBeGreaterThan(0);
      expect(v2Result.chartData.length).toBeGreaterThan(0);

      const v1Bins = parseBins(v1Result.chartData);
      const v2Bins = parseBins(v2Result.chartData);

      const v1Total = v1Bins.reduce((s, b) => s + b.count, 0);
      const v2Total = v2Bins.reduce((s, b) => s + b.count, 0);

      // Total count: allow ±1. ClickHouse histogram() returns float counts
      // per bin (it distributes points across bins using an adaptive algorithm).
      // Math.round() on each bin independently can shift the sum by ±1.
      expect(Math.abs(v2Total - v1Total)).toBeLessThanOrEqual(1);

      // Value range should be similar
      const v1Min = Math.min(...v1Bins.map((b) => b.lower));
      const v2Min = Math.min(...v2Bins.map((b) => b.lower));
      const v1Max = Math.max(...v1Bins.map((b) => b.upper));
      const v2Max = Math.max(...v2Bins.map((b) => b.upper));
      expect(Math.abs(v1Min - v2Min)).toBeLessThan(0.5);
      expect(Math.abs(v1Max - v2Max)).toBeLessThan(0.5);

      // Cumulative distribution at data-relative quartile points.
      const range = v1Max - v1Min;
      const thresholds = [0.25, 0.5, 0.75].map((q) => v1Min + q * range);
      const v1Cum = cumulativeCountsAt(v1Bins, thresholds);
      const v2Cum = cumulativeCountsAt(v2Bins, thresholds);
      const tolerance = Math.ceil(v1Total * 0.15);
      for (let i = 0; i < thresholds.length; i++) {
        expect(Math.abs(v1Cum[i] - v2Cum[i])).toBeLessThanOrEqual(tolerance);
      }
    });

    it("should return matching histogram shape between v1 and v2 for BOOLEAN scores", async () => {
      const caller = makeCaller();
      const [v1Result, v2Result] = await Promise.all([
        caller.dashboard.scoreHistogram(
          histInput(
            "v1",
            HIST_BOOLEAN.name,
            HIST_BOOLEAN.source,
            HIST_BOOLEAN.dataType,
          ),
        ),
        caller.dashboard.scoreHistogram(
          histInput(
            "v2",
            HIST_BOOLEAN.name,
            HIST_BOOLEAN.source,
            HIST_BOOLEAN.dataType,
          ),
        ),
      ]);

      expect(v1Result.chartData.length).toBeGreaterThan(0);
      expect(v2Result.chartData.length).toBeGreaterThan(0);

      const v1Bins = parseBins(v1Result.chartData);
      const v2Bins = parseBins(v2Result.chartData);

      const v1Total = v1Bins.reduce((s, b) => s + b.count, 0);
      const v2Total = v2Bins.reduce((s, b) => s + b.count, 0);

      // Total count: allow ±1
      expect(Math.abs(v2Total - v1Total)).toBeLessThanOrEqual(1);

      // Value range: BOOLEAN scores are 0 or 1, both versions should span [0, 1]
      const v1Min = Math.min(...v1Bins.map((b) => b.lower));
      const v2Min = Math.min(...v2Bins.map((b) => b.lower));
      const v1Max = Math.max(...v1Bins.map((b) => b.upper));
      const v2Max = Math.max(...v2Bins.map((b) => b.upper));
      expect(Math.abs(v1Min - v2Min)).toBeLessThan(0.5);
      expect(Math.abs(v1Max - v2Max)).toBeLessThan(0.5);

      // Cumulative distribution at midpoint should roughly agree.
      const v1Lower = cumulativeCountsAt(v1Bins, [0.5])[0];
      const v2Lower = cumulativeCountsAt(v2Bins, [0.5])[0];
      const tolerance = Math.ceil(v1Total * 0.15);
      expect(Math.abs(v1Lower - v2Lower)).toBeLessThanOrEqual(tolerance);
    });
  });

  // ─── 9. Model usage by-type timeseries (v2 via executeQuery + pairExpand) ──

  const COST_BY_TYPE_QUERY = "observations-cost-by-type-timeseries" as const;
  const USAGE_BY_TYPE_QUERY = "observations-usage-by-type-timeseries" as const;

  maybe("model usage by-type timeseries v2", () => {
    const typeInput = (
      version: "v1" | "v2",
      queryName: typeof COST_BY_TYPE_QUERY | typeof USAGE_BY_TYPE_QUERY,
    ) => ({
      projectId,
      from: "traces_observations" as const,
      select: [],
      filter: [
        {
          column: "startTime",
          operator: ">=" as const,
          value: new Date(fromTimestamp7d),
          type: "datetime" as const,
        },
        {
          column: "startTime",
          operator: "<" as const,
          value: new Date(toTimestamp),
          type: "datetime" as const,
        },
        {
          column: "type",
          operator: "any of" as const,
          value: getGenerationLikeTypes(),
          type: "stringOptions" as const,
        },
      ],
      limit: 10000,
      version,
      queryName,
    });

    /** Sum all rows' `sum` values per `key` across all time buckets. */
    function sumByKey(rows: DatabaseRow[]): Map<string, number> {
      const acc = new Map<string, number>();
      for (const row of rows) {
        const k = String(row["key"]);
        acc.set(k, (acc.get(k) ?? 0) + Number(row["sum"] ?? 0));
      }
      return acc;
    }

    describe("cost by type timeseries v2", () => {
      it("should return valid cost by type data for v2", async () => {
        const caller = makeCaller();
        const result = await caller.dashboard.chart(
          typeInput("v2", COST_BY_TYPE_QUERY),
        );

        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
        const keys = new Set(
          result.map((r) => String((r as DatabaseRow)["key"])),
        );
        // Both modes include "total". Seeder data additionally has "input"/"output"
        // because its cost_details maps are fully populated (see data-generators.ts).
        // Synthetic data uses { total: ... } only (see seedSynthetic in this file).
        expect(keys.has("total")).toBe(true);
        if (DATA_MODE === "seeder") {
          expect(keys.has("input")).toBe(true);
          expect(keys.has("output")).toBe(true);
        }
      });

      it("should return matching cost totals between v1 and v2", async () => {
        const caller = makeCaller();
        const [v1, v2] = await Promise.all([
          caller.dashboard.chart(typeInput("v1", COST_BY_TYPE_QUERY)),
          caller.dashboard.chart(typeInput("v2", COST_BY_TYPE_QUERY)),
        ]);

        const v1Totals = sumByKey(v1 as DatabaseRow[]);
        const v2Totals = sumByKey(v2 as DatabaseRow[]);

        expect(v1Totals.size).toBeGreaterThan(0);
        expect(v2Totals.size).toBeGreaterThan(0);

        // Every key present in v1 must also appear in v2
        for (const key of v1Totals.keys()) {
          expect(v2Totals.has(key)).toBe(true);
        }

        // Per-key totals must agree within 5%
        // (ClickHouse eventual consistency between observations FINAL and events_core)
        for (const [key, v1Sum] of v1Totals) {
          const v2Sum = v2Totals.get(key) ?? 0;
          if (v1Sum === 0) {
            expect(v2Sum).toBeCloseTo(0, 2);
          } else {
            const ratio = v2Sum / v1Sum;
            expect(ratio).toBeGreaterThanOrEqual(0.95);
            expect(ratio).toBeLessThanOrEqual(1.05);
          }
        }
      });
    });

    describe("usage by type timeseries v2", () => {
      it("should return valid usage by type data for v2", async () => {
        const caller = makeCaller();
        const result = await caller.dashboard.chart(
          typeInput("v2", USAGE_BY_TYPE_QUERY),
        );

        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
        const keys = new Set(
          result.map((r) => String((r as DatabaseRow)["key"])),
        );
        // Both modes include "total". Seeder data additionally has "input"/"output".
        expect(keys.has("total")).toBe(true);
        if (DATA_MODE === "seeder") {
          expect(keys.has("input")).toBe(true);
          expect(keys.has("output")).toBe(true);
        }
      });

      it("should return matching usage totals between v1 and v2", async () => {
        const caller = makeCaller();
        const [v1, v2] = await Promise.all([
          caller.dashboard.chart(typeInput("v1", USAGE_BY_TYPE_QUERY)),
          caller.dashboard.chart(typeInput("v2", USAGE_BY_TYPE_QUERY)),
        ]);

        const v1Totals = sumByKey(v1 as DatabaseRow[]);
        const v2Totals = sumByKey(v2 as DatabaseRow[]);

        expect(v1Totals.size).toBeGreaterThan(0);
        expect(v2Totals.size).toBeGreaterThan(0);

        for (const key of v1Totals.keys()) {
          expect(v2Totals.has(key)).toBe(true);
        }

        for (const [key, v1Sum] of v1Totals) {
          const v2Sum = v2Totals.get(key) ?? 0;
          if (v1Sum === 0) {
            expect(v2Sum).toBeCloseTo(0, 2);
          } else {
            const ratio = v2Sum / v1Sum;
            expect(ratio).toBeGreaterThanOrEqual(0.95);
            expect(ratio).toBeLessThanOrEqual(1.05);
          }
        }
      });
    });
  });

  // ─── v2 traces optimization: uniq(trace_id) on observations view ──────

  maybe("v2 traces optimization: uniq(trace_id) on observations view", () => {
    const traceNameNotNullFilter = {
      type: "null" as const,
      column: "traceName",
      operator: "is not null" as const,
      value: "" as const,
    };

    it.each(["1d", "7d"] as const)(
      "total count: observations uniq(traceId) matches traces count for %s window",
      async (window) => {
        const tracesQuery: QueryType = {
          view: "traces",
          dimensions: [],
          metrics: [{ measure: "count", aggregation: "count" }],
          timeDimension: null,
          filters: [],
          orderBy: null,
          fromTimestamp: fromFor(window),
          toTimestamp,
        };
        const obsQuery: QueryType = {
          view: "observations",
          dimensions: [],
          metrics: [{ measure: "traceId", aggregation: "uniq" }],
          timeDimension: null,
          filters: [],
          orderBy: null,
          fromTimestamp: fromFor(window),
          toTimestamp,
        };
        const [tracesResult, obsResult] = await Promise.all([
          executeQuery(projectId, tracesQuery, "v2", true),
          executeQuery(projectId, obsQuery, "v2", true),
        ]);
        const tracesCount = tracesResult.reduce(
          (s, r) => s + Number(r.count_count),
          0,
        );
        const obsCount = obsResult.reduce(
          (s, r) => s + Number(r.uniq_traceId),
          0,
        );
        if (window === "7d") {
          expect(obsCount).toBe(tracesCount);
        } else {
          // 1d: observations counts "traces active in window" which is >=
          // "traces started in window" (traces view uses rootEventCondition).
          expect(obsCount).toBeGreaterThanOrEqual(tracesCount);
          expect(obsCount).toBeLessThan(tracesCount * 10);
        }
      },
    );

    it.each(["1d", "7d"] as const)(
      "grouped by trace name: observations traceName matches traces name for %s window",
      async (window) => {
        const tracesQuery: QueryType = {
          view: "traces",
          dimensions: [{ field: "name" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          timeDimension: null,
          filters: [],
          orderBy: [{ field: "count_count", direction: "desc" }],
          fromTimestamp: fromFor(window),
          toTimestamp,
          chartConfig: { type: "table", row_limit: 20 },
        };
        const obsQuery: QueryType = {
          view: "observations",
          dimensions: [{ field: "traceName" }],
          metrics: [{ measure: "traceId", aggregation: "uniq" }],
          timeDimension: null,
          filters: [traceNameNotNullFilter],
          orderBy: [{ field: "uniq_traceId", direction: "desc" }],
          fromTimestamp: fromFor(window),
          toTimestamp,
          chartConfig: { type: "table", row_limit: 20 },
        };
        const [tracesResult, obsResult] = await Promise.all([
          executeQuery(projectId, tracesQuery, "v2", true),
          executeQuery(projectId, obsQuery, "v2", true),
        ]);
        const tracesMap = toMap(tracesResult, "name");
        const obsMap = toMap(obsResult, "traceName");

        if (window === "7d") {
          expect(obsMap.size).toBe(tracesMap.size);
          for (const [name, tracesRow] of tracesMap) {
            const obsRow = obsMap.get(name);
            expect(obsRow).toBeDefined();
            expect(Number(obsRow!.uniq_traceId)).toBe(
              Number(tracesRow.count_count),
            );
          }
        } else {
          expect(obsMap.size).toBeGreaterThanOrEqual(tracesMap.size);
          expect(obsMap.size).toBeLessThan(tracesMap.size * 10);
        }
      },
    );

    it.each(["1d", "7d"] as const)(
      "grouped by userId: observations uniq(traceId) matches traces for %s window",
      async (window) => {
        const tracesQuery: QueryType = {
          view: "traces",
          dimensions: [{ field: "userId" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          timeDimension: null,
          filters: [],
          orderBy: null,
          fromTimestamp: fromFor(window),
          toTimestamp,
        };
        const obsQuery: QueryType = {
          view: "observations",
          dimensions: [{ field: "userId" }],
          metrics: [{ measure: "traceId", aggregation: "uniq" }],
          timeDimension: null,
          filters: [],
          orderBy: null,
          fromTimestamp: fromFor(window),
          toTimestamp,
        };
        const [tracesResult, obsResult] = await Promise.all([
          executeQuery(projectId, tracesQuery, "v2", true),
          executeQuery(projectId, obsQuery, "v2", true),
        ]);
        const tracesMap = toMap(tracesResult, "userId");
        const obsMap = toMap(obsResult, "userId");

        // userId is not consistently denormalized across events (traces view
        // picks one via argMaxIf, observations view sees raw per-event values),
        // so we allow approximate matching for both windows.
        expect(obsMap.size).toBeGreaterThanOrEqual(tracesMap.size);
        expect(obsMap.size).toBeLessThan(
          tracesMap.size * (window === "7d" ? 2 : 10),
        );
      },
    );
  });
});
