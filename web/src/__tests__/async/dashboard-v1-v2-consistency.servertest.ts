import { type QueryType } from "@/src/features/query/types";
import { executeQuery } from "@/src/features/query/server/queryExecutor";
import {
  queryClickhouse,
  clickhouseClient,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import { getGenerationLikeTypes } from "@langfuse/shared";
import { env } from "@/src/env.mjs";

// Skip when events table is not enabled (v2 queries require events_core).
const maybe =
  env.LANGFUSE_ENABLE_EVENTS_TABLE_V2_APIS === "true"
    ? describe
    : describe.skip;

/**
 * Dashboard v1 vs v2 consistency tests.
 *
 * Runs the same dashboard queries against the seed project's data using both
 * v1 (traces/observations tables) and v2 (events_core table) and compares
 * results to ensure the dashboard "v4 Beta" toggle does not change metrics.
 *
 * The v2 traces view uses a rootEventCondition subquery to select trace_ids
 * whose root event (parent_span_id = '') has start_time in the query window,
 * matching v1's behavior of filtering by traces.timestamp.
 *
 * Prerequisites: seed data must be loaded (pnpm run db:seed + dev-tables.sh).
 */
describe("dashboard v1 vs v2 consistency", () => {
  it("should not hang redis when events table is disabled", () => {
    // At least one test case must run to avoid hanging the redis connection
    // when everything else is skipped via `maybe`.
  });

  const seedProjectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
  let projectId: string;

  // Time boundaries derived from actual seed data
  let fromTimestamp1d: string;
  let fromTimestamp7d: string;
  let toTimestamp: string;

  beforeAll(async () => {
    // Create an isolated project so parallel tests cannot contaminate our data.
    const org = await createOrgProjectAndApiKey();
    projectId = org.projectId;

    // Copy seed data into the isolated project using INSERT...SELECT.
    const client = clickhouseClient();
    for (const table of ["traces", "observations", "events"]) {
      try {
        await client.command({
          query: `INSERT INTO ${table} SELECT * REPLACE({newProjectId: String} AS project_id) FROM ${table} FINAL WHERE project_id = {seedProjectId: String}`,
          query_params: { seedProjectId, newProjectId: projectId },
        });
      } catch {
        // events table may not exist when v2 APIs are disabled
      }
    }

    const maxTsResult = await queryClickhouse<{ max_ts: string }>({
      query: `SELECT max(timestamp) as max_ts FROM traces WHERE project_id = {projectId: String}`,
      params: { projectId },
    });

    const maxTs = new Date(maxTsResult[0]?.max_ts ?? Date.now());

    let maxTsEvents = new Date(0);
    if (env.LANGFUSE_ENABLE_EVENTS_TABLE_V2_APIS === "true") {
      const maxTsEventsResult = await queryClickhouse<{ max_ts: string }>({
        query: `SELECT max(event_ts) as max_ts FROM events_core WHERE project_id = {projectId: String}`,
        params: { projectId },
      });
      maxTsEvents = new Date(maxTsEventsResult[0]?.max_ts ?? Date.now());
    }

    const effectiveMax =
      maxTs.getTime() > maxTsEvents.getTime() ? maxTs : maxTsEvents;

    toTimestamp = new Date(
      effectiveMax.getTime() + 60 * 60 * 1000,
    ).toISOString();
    fromTimestamp1d = new Date(
      effectiveMax.getTime() - 24 * 60 * 60 * 1000,
    ).toISOString();
    fromTimestamp7d = new Date(
      effectiveMax.getTime() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
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
      "should have matching totals for %s window",
      async (window) => {
        await expectExactTotalCount({
          view: "traces",
          dimensions: [],
          metrics: [{ measure: "count", aggregation: "count" }],
          timeDimension: { granularity: "day" },
          filters: [],
          orderBy: null,
          fromTimestamp: fromFor(window),
          toTimestamp,
        });
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

      // Note: totalCost may differ between v1 (observations.total_cost column)
      // and v2 (events_core cost_details['total'] ALIAS) due to how costs are
      // stored/computed in the two tables. This is a known data consistency gap.
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
