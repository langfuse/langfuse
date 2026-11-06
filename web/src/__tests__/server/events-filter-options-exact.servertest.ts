/**
 * Execution coverage for getEventsExactFilterOptionsForColumns.
 *
 * The golden SQL test (packages/shared/.../event-filter-options.golden.test.ts)
 * pins the generated string; this test runs the query against real ClickHouse to
 * prove the array machinery (sumMap -> arrayZip -> arraySort -> arraySlice, plus
 * the boolean countIf branch and labeledScalar nested key) actually executes and
 * returns exact values/counts for one column of every kind.
 */
import { vi } from "vitest";

// The events tables are created only by the ClickHouse dev-tables setup, which
// runs where the v4 preview opt-in is enabled. -azure / -redis-cluster CI legs
// skip it, so gate on the ORIGINAL opt-in flag captured before any override.
const eventsTableAvailable = vi.hoisted(
  () => process.env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true",
);

import {
  createEvent,
  createEventsCh,
  getEventsExactFilterOptionsForColumns,
  getObservationsCountsFromEventsTable,
  getObservationsWithModelDataFromEventsTable,
  buildEventsBlobExportStreamQuery,
  queryClickhouse,
  createTraceScore,
  createScoresCh,
  type EventFilterOptionRow,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import waitForExpect from "wait-for-expect";
import { getEventFilterOptions } from "@/src/features/events/server/eventsService";

const maybe = eventsTableAvailable ? describe : describe.skip;

// Keeps the file from hanging (on redis connections opened by the shared server
// imports) when the events-table suite below is skipped.
describe("events exact filter options liveness", () => {
  it("does not hang when the events table is unavailable", () => {});
});

maybe("getEventsExactFilterOptionsForColumns (execution)", () => {
  const valuesFor = (rows: EventFilterOptionRow[], column: string) =>
    rows
      .filter((r) => r.column === column)
      .map((r) => ({
        value: r.value,
        count: r.count,
        displayValue: r.displayValue ?? "",
      }));

  it("keeps all native rows and facets in current agent traces while excluding stale or mismatched membership", async () => {
    const projectId = randomUUID();
    const from = new Date("2026-11-02T11:00:00Z");
    const to = new Date("2026-11-02T15:00:00Z");
    const common = {
      project_id: projectId,
      start_time: from.getTime() + 1000,
      end_time: from.getTime() + 2000,
      environment: "production",
      event_ts: Date.now(),
      agent_id: "",
      agent_name: "",
      agent_run_id: "",
      agent_identity_source: "",
    };
    const member = {
      ...common,
      agent_id: "selected",
      agent_name: "Selected",
      agent_run_id: "run",
      type: "AGENT" as const,
      name: "agent",
    };
    await createEventsCh([
      createEvent({
        ...common,
        trace_id: "included",
        span_id: "root",
        type: "SPAN",
        name: "root",
      }),
      createEvent({ ...member, trace_id: "included", span_id: "run" }),
      createEvent({
        ...common,
        trace_id: "included",
        span_id: "model",
        type: "GENERATION",
        name: "other-model",
        agent_id: "other",
        agent_name: "Other",
      }),
      createEvent({
        ...member,
        trace_id: "included",
        span_id: "selected-tool",
        type: "TOOL",
        name: "selected-tool",
      }),
      createEvent({
        ...common,
        trace_id: "included",
        span_id: "other-tool",
        type: "TOOL",
        name: "other-tool",
        agent_id: "other",
        agent_name: "Other",
      }),
      createEvent({
        ...common,
        trace_id: "wrong-env",
        span_id: "env-root",
        name: "unrelated",
      }),
      createEvent({
        ...member,
        trace_id: "wrong-env",
        span_id: "env-agent",
        environment: "staging",
      }),
      createEvent({
        ...common,
        trace_id: "deleted",
        span_id: "deleted-root",
        name: "unrelated",
      }),
      createEvent({ ...member, trace_id: "deleted", span_id: "deleted-agent" }),
      createEvent({
        ...member,
        trace_id: "deleted",
        span_id: "deleted-agent",
        is_deleted: 1,
        event_ts: common.event_ts + 1,
      }),
      createEvent({
        ...common,
        trace_id: "reclassified",
        span_id: "changed-root",
        name: "unrelated",
      }),
      createEvent({
        ...member,
        trace_id: "reclassified",
        span_id: "changed-agent",
      }),
      createEvent({
        ...member,
        trace_id: "reclassified",
        span_id: "changed-agent",
        agent_id: "other",
        event_ts: common.event_ts + 1,
      }),
    ]);
    await createScoresCh([
      createTraceScore({
        project_id: projectId,
        trace_id: "included",
        observation_id: "selected-tool",
        name: "selected-score",
        data_type: "NUMERIC",
        value: 1,
        timestamp: from.getTime() + 1000,
      }),
      createTraceScore({
        project_id: projectId,
        trace_id: "included",
        observation_id: "other-tool",
        name: "other-score",
        data_type: "NUMERIC",
        value: 1,
        timestamp: from.getTime() + 1000,
      }),
      createTraceScore({
        project_id: projectId,
        trace_id: "included",
        observation_id: null,
        name: "trace-score",
        data_type: "NUMERIC",
        value: 1,
        timestamp: from.getTime() + 1000,
      }),
      createTraceScore({
        project_id: projectId,
        trace_id: "wrong-env",
        observation_id: "env-agent",
        name: "unrelated-score",
        data_type: "NUMERIC",
        value: 1,
        timestamp: from.getTime() + 1000,
      }),
    ]);
    const agentScope = {
      identity: { kind: "id" as const, value: "selected" },
      from,
      to,
      environment: "production",
    };
    await waitForExpect(async () => {
      const counts = await getObservationsCountsFromEventsTable({
        projectId,
        filter: [],
        agentScope,
      });
      expect(counts).toEqual({ totalCount: 5, uniqueTraceCount: 1 });
      const rows = await getObservationsWithModelDataFromEventsTable({
        projectId,
        filter: [
          {
            type: "string",
            column: "type",
            operator: "=",
            value: "GENERATION",
          },
        ],
        agentScope,
        limit: 50,
      });
      expect(rows.map((row) => row.name)).toEqual(["other-model"]);
      const facets = await getEventsExactFilterOptionsForColumns({
        projectId,
        filter: [],
        agentScope,
        columns: ["name"],
      });
      expect(
        valuesFor(facets, "name")
          .map((row) => row.value)
          .sort(),
      ).toEqual([
        "agent",
        "other-model",
        "other-tool",
        "root",
        "selected-tool",
      ]);
      const tools = await getObservationsWithModelDataFromEventsTable({
        projectId,
        filter: [],
        agentScope: { ...agentScope, mode: "tools" },
        limit: 50,
      });
      expect(tools.map((row) => row.name)).toEqual(["selected-tool"]);
      const invocations = await getObservationsCountsFromEventsTable({
        projectId,
        filter: [],
        agentScope: { ...agentScope, mode: "invocations" },
      });
      expect(invocations).toEqual({ totalCount: 1, uniqueTraceCount: 1 });
      const exported = buildEventsBlobExportStreamQuery({
        projectId,
        filter: [],
        agentScope: { ...agentScope, mode: "tools" },
        rowLimit: 50,
      }).queryBuilder.buildWithParams();
      const exportRows = await queryClickhouse<{ name: string }>(exported);
      expect(exportRows.map((row) => row.name)).toEqual(["selected-tool"]);
      const scoreOptions = await getEventFilterOptions({
        projectId,
        agentScope: { ...agentScope, mode: "tools" },
        columns: ["scores_avg"],
        startTimeFilter: [
          {
            type: "datetime",
            column: "startTime",
            operator: ">=",
            value: from,
          },
          { type: "datetime", column: "startTime", operator: "<=", value: to },
        ],
      });
      expect(scoreOptions.scores_avg?.sort()).toEqual([
        "selected-score",
        "trace-score",
      ]);
      const scored = await getObservationsWithModelDataFromEventsTable({
        projectId,
        agentScope: { ...agentScope, mode: "tools" },
        filter: [
          {
            type: "numberObject",
            column: "scores_avg",
            key: "selected-score",
            operator: ">=",
            value: 1,
          },
        ],
        limit: 50,
      });
      expect(scored.map((row) => row.name)).toEqual(["selected-tool"]);
    }, 5000);
  });

  it("returns exact facet values and counts for every column kind", async () => {
    const projectId = randomUUID();

    await createEventsCh([
      // Root observation (is_app_root); contributes user u1, exp1, tags alpha+beta.
      createEvent({
        project_id: projectId,
        user_id: "u1",
        tags: ["alpha", "beta"],
        experiment_id: "exp1",
        experiment_name: "Exp One",
        is_app_root: true,
      }),
      // Non-root; shares user u1, exp1 and tag beta so their counts sum across rows.
      createEvent({
        project_id: projectId,
        user_id: "u1",
        tags: ["beta"],
        experiment_id: "exp1",
        experiment_name: "Exp One",
        parent_span_id: "span-b",
      }),
      // Non-root; distinct user u2, exp2 and tag gamma (each count 1).
      createEvent({
        project_id: projectId,
        user_id: "u2",
        tags: ["gamma"],
        experiment_id: "exp2",
        experiment_name: "Exp Two",
        parent_span_id: "span-c",
      }),
      // Exercises the include filters: null user_id and null experiment_id are
      // excluded; the empty-string tag is dropped by arrayFilter(length > 0)
      // while "delta" survives.
      createEvent({
        project_id: projectId,
        user_id: null,
        tags: ["", "delta"],
        experiment_id: null,
        experiment_name: null,
        parent_span_id: "span-d",
      }),
    ]);

    // events_core is populated from events_full via the events_core_mv MV; poll
    // until it catches up rather than asserting immediately after the insert.
    await waitForExpect(async () => {
      const rows = await getEventsExactFilterOptionsForColumns({
        projectId,
        filter: [],
        columns: ["userId", "experimentId", "traceTags", "isRootObservation"],
      });

      // scalar: countDesc, null excluded.
      expect(valuesFor(rows, "userId")).toEqual([
        { value: "u1", count: 2, displayValue: "" },
        { value: "u2", count: 1, displayValue: "" },
      ]);

      // labeledScalar: value + label from the nested key, null excluded.
      expect(valuesFor(rows, "experimentId")).toEqual([
        { value: "exp1", count: 2, displayValue: "Exp One" },
        { value: "exp2", count: 1, displayValue: "Exp Two" },
      ]);

      // array: alpha sort, empty-string tag filtered out, beta summed across rows.
      expect(valuesFor(rows, "traceTags")).toEqual([
        { value: "alpha", count: 1, displayValue: "" },
        { value: "beta", count: 2, displayValue: "" },
        { value: "delta", count: 1, displayValue: "" },
        { value: "gamma", count: 1, displayValue: "" },
      ]);

      // boolean: booleanAsc (false before true).
      expect(valuesFor(rows, "isRootObservation")).toEqual([
        { value: "false", count: 3, displayValue: "" },
        { value: "true", count: 1, displayValue: "" },
      ]);
    });
  });
});
