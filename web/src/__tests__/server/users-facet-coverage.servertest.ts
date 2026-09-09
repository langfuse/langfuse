/**
 * The Users sidebar inherits its facets from the Traces and Observations
 * configs, and both Users read paths scan a single table with no observation,
 * score, or comment join. So a facet that is perfectly valid on Traces can be
 * a 400 on Users, and nothing in the type system says so — the failure is a
 * ClickHouse "unknown identifier s.value" at request time, or an
 * `InvalidRequestError` out of the filter factory.
 *
 * This pins the deny-lists in `users-config.ts` to the queries they describe:
 * every facet the sidebar offers is run through the real Users query on its
 * own read path, so inheriting a new join-dependent facet fails here instead
 * of in a user's browser.
 */
import { randomUUID } from "crypto";

import {
  usersEventsFilterConfig,
  usersFilterConfig,
} from "@/src/features/filters/config/users-config";
import type { FilterConfig } from "@/src/features/filters/lib/filter-config";
import { type ColumnDefinition, type FilterState } from "@langfuse/shared";
import {
  createEvent,
  createEventsCh,
  createObservation,
  createObservationsCh,
  createTrace,
  createTracesCh,
  getTotalUserCount,
  getTracesGroupedByUsers,
  getUserMetrics,
  getUserMetricsFromEventsTable,
  getUsersCountFromEventsTable,
  getUsersFromEventsTable,
} from "@langfuse/shared/src/server";

const projectId = randomUUID();
const userId = `facet-coverage-${randomUUID()}`;
const traceId = randomUUID();

const PROBE_KEY = "__facet_probe_key__";

type Facet = FilterConfig["facets"][number];

/**
 * The FilterState the sidebar persists for this facet, matching the
 * type/operator pairs `sidebar-filter-actions.ts` writes. Values are chosen to
 * match the seeded row where possible: a filter that compiles but excludes
 * everything still proves the SQL is legal, but matching keeps the assertion
 * honest about the join actually resolving.
 */
function buildFilter(
  facet: Facet,
  columnDefinitions: ColumnDefinition[],
): FilterState {
  const column = facet.column;
  const colType = columnDefinitions.find(
    (c) => c.id === column || c.name === column,
  )?.type;

  switch (facet.type) {
    case "categorical":
      return [
        {
          column,
          type: colType === "arrayOptions" ? "arrayOptions" : "stringOptions",
          operator: "any of",
          value: ["default"],
        },
      ] as FilterState;
    case "string":
      return [
        { column, type: "string", operator: "contains", value: "" },
      ] as FilterState;
    case "numeric":
      // ">= 0" matches every seeded row and stays inside the narrow
      // Decimal64(12) range the cost columns cast to.
      return [
        { column, type: "number", operator: ">=", value: 0 },
      ] as FilterState;
    case "boolean":
      return [
        { column, type: "boolean", operator: "=", value: true },
      ] as FilterState;
    case "stringKeyValue":
      return [
        {
          column,
          type: "stringObject",
          operator: "=",
          key: PROBE_KEY,
          value: "",
        },
      ] as FilterState;
    case "keyValue":
      return [
        {
          column,
          type: "categoryOptions",
          operator: "any of",
          key: PROBE_KEY,
          value: ["probe"],
        },
      ] as FilterState;
    case "numericKeyValue":
      return [
        {
          column,
          type: "numberObject",
          operator: ">=",
          key: PROBE_KEY,
          value: 0,
        },
      ] as FilterState;
    case "booleanKeyValue":
      return [
        {
          column,
          type: "booleanObject",
          operator: "=",
          key: PROBE_KEY,
          value: true,
        },
      ] as FilterState;
  }
}

const runV3 = async (filter: FilterState) => {
  // The router passes no `columns`/`columnDefinitions`, so the defaults
  // (tracesTableUiColumnDefinitions + tracesTableCols) apply here too.
  await getTracesGroupedByUsers(projectId, filter, undefined, 50, 0, undefined);
  await getTotalUserCount(projectId, filter, undefined);
  await getUserMetrics(projectId, [userId], filter);
};

const runV4 = async (filter: FilterState) => {
  await getUsersFromEventsTable(projectId, filter, undefined, 50, 0);
  await getUsersCountFromEventsTable(projectId, filter, undefined);
  await getUserMetricsFromEventsTable(projectId, [userId], filter);
};

describe("users sidebar facet coverage", () => {
  beforeAll(async () => {
    await createTracesCh([
      createTrace({
        id: traceId,
        project_id: projectId,
        user_id: userId,
        session_id: `facet-coverage-session-${randomUUID()}`,
        environment: "default",
        name: "facet-coverage-trace",
        tags: ["facet-coverage-tag"],
        version: "v1",
        release: "r1",
      }),
    ]);

    await createObservationsCh([
      createObservation({
        id: randomUUID(),
        trace_id: traceId,
        project_id: projectId,
        type: "GENERATION",
        usage_details: { input: 10, output: 20, total: 30 },
        total_cost: 5,
      }),
    ]);

    await createEventsCh([
      createEvent({
        id: randomUUID(),
        span_id: randomUUID(),
        parent_span_id: "",
        type: "SPAN",
        project_id: projectId,
        trace_id: traceId,
        user_id: userId,
        session_id: `facet-coverage-session-${randomUUID()}`,
        environment: "default",
        name: "facet-coverage-event",
        trace_name: "facet-coverage-trace",
        tags: ["facet-coverage-tag"],
        version: "v1",
        release: "r1",
      }),
    ]);
  });

  it("seeds a user reachable on both read paths", async () => {
    const v3 = await getTracesGroupedByUsers(
      projectId,
      [],
      undefined,
      50,
      0,
      undefined,
    );
    const v4 = await getUsersFromEventsTable(projectId, [], undefined, 50, 0);
    expect(v3.map((u) => u.user)).toContain(userId);
    expect(v4.map((u) => u.user)).toContain(userId);
  });

  it.each(usersFilterConfig.facets.map((f) => [f.column, f] as const))(
    "v3 users query answers the %s facet",
    async (_column, facet) => {
      await expect(
        runV3(buildFilter(facet, usersFilterConfig.columnDefinitions)),
      ).resolves.toBeUndefined();
    },
  );

  it.each(usersEventsFilterConfig.facets.map((f) => [f.column, f] as const))(
    "v4 users query answers the %s facet",
    async (_column, facet) => {
      await expect(
        runV4(buildFilter(facet, usersEventsFilterConfig.columnDefinitions)),
      ).resolves.toBeUndefined();
    },
  );

  // Without this the suite passes just as happily if every facet were removed
  // from the config, or if the queries had quietly stopped rejecting anything.
  it("rejects the score facet both configs exclude", async () => {
    const scoreFilter = [
      {
        column: "scores_avg",
        type: "numberObject",
        operator: ">=",
        key: "quality",
        value: 0,
      },
    ] as FilterState;

    await expect(runV3(scoreFilter)).rejects.toThrow();
    await expect(runV4(scoreFilter)).rejects.toThrow();
  });
});
