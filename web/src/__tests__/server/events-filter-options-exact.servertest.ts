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
  type EventFilterOptionRow,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import waitForExpect from "wait-for-expect";

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
