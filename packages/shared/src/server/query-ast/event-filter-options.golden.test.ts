// Golden SQL for the exact scores-view filter-option facets. The recorded
// snapshot (__snapshots__/event-filter-options.golden.test.ts.snap) is the
// authoritative full-SQL example; this header annotates the array machinery that
// makes it a single-scan, exact, multi-facet query.
//
// Shape: one events_core scan -> one aggregated row of per-facet top-N arrays
// -> arrayJoin fan-out -> tidy (column, value, count, displayValue) rows.
//
//   aggregated_options   one row, one column per facet, each an
//                        Array((key, count)) top-N (alias `<column>TopOptions`):
//     scalar/array     sumMap -> (keys[], counts[]); arrayZip stitches the two
//                      parallel arrays into (key, count) pairs; arraySort ranks
//                      (count DESC, value ASC for countDesc; value ASC for alpha)
//                      BEFORE arraySlice caps to {optionLimit}, so the top-N is
//                      deterministic at the boundary. The sumMap subexpression
//                      appears twice (one read per tuple element) but ClickHouse
//                      dedupes identical aggregate states -> single pass.
//     labeledScalar    same, but the sumMap key is a (value, label) tuple.
//     boolean          built directly as [('false', countIf(...)), ('true',
//                      countIf(...))] — already (key, count) shaped, only two
//                      buckets, so it skips the zip/rank/slice.
//   option_rows        arrayConcat glues every facet's array together, arrayJoin
//                      explodes the single row into one row per option tuple
//                      (column, value, count, sortKey, displayValue). value/label
//                      unpack one level deeper for labeledScalar; displayValue is
//                      '' for the other kinds.
//   final SELECT       scales count by _sample_factor and orders by
//                      column, sortKey (the count/alpha/boolean rank), then value.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "../../env";
import type { EventFilterOptionColumn } from "../queries/clickhouse-sql/event-filter-options";
import {
  capturedQueries,
  clickhouseFormatAvailable,
  normalizeCapturedQueries,
  resetCaptures,
} from "./goldenHarness";

// Record the exec seam instead of hitting ClickHouse. The factory is hoisted
// above imports, so it pulls the harness in via dynamic import; the captured
// store is a module singleton shared with the assertions below.
vi.mock("../repositories/clickhouse", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../repositories/clickhouse")>();
  const { buildClickhouseMock } = await import("./goldenHarness.js");
  return buildClickhouseMock(actual);
});

import { getEventsExactFilterOptionsForColumns } from "../repositories/events";

const FIXED_PROJECT_ID = "golden-project";
// Fixed so the captured scope-window params are deterministic across runs.
const FIXED_FROM_TIMESTAMP = new Date("2026-01-01T00:00:00.000Z");
const FIXED_TO_TIMESTAMP = new Date("2026-01-01T00:30:00.000Z");

// One column of each kind so the snapshot exercises every aggregate branch:
// scalar (userId), labeledScalar (experimentId), array (traceTags), and
// boolean (isRootObservation).
const COLUMNS: readonly EventFilterOptionColumn[] = [
  "userId",
  "experimentId",
  "traceTags",
  "isRootObservation",
];

// clickhouse format is the normalizer; without it a comparison would be
// unnormalized and could pass on cosmetic-only differences. Skip loudly.
const describeWithClickhouse = clickhouseFormatAvailable()
  ? describe
  : describe.skip;

if (!clickhouseFormatAvailable()) {
  console.warn(
    "[golden-harness] `clickhouse format` unavailable — skipping golden SQL tests. Install clickhouse-local to run them.",
  );
}

describeWithClickhouse(
  "golden: events.getEventsExactFilterOptionsForColumns",
  () => {
    // Exact facets are a v4 events_core feature; pin the write mode so the base
    // scan is deterministic regardless of the ambient env.
    const originalWriteMode = env.LANGFUSE_MIGRATION_V4_WRITE_MODE;

    beforeEach(() => {
      resetCaptures();
      env.LANGFUSE_MIGRATION_V4_WRITE_MODE = "events_only";
    });
    afterAll(() => {
      env.LANGFUSE_MIGRATION_V4_WRITE_MODE = originalWriteMode;
    });

    // The scope semi-join is the only input that branches the emitted SQL for a
    // fixed column set, so enumerate present vs. absent.
    it("scope=unset — project-only WHERE, no scores semi-join", async () => {
      await getEventsExactFilterOptionsForColumns({
        projectId: FIXED_PROJECT_ID,
        filter: [],
        columns: COLUMNS,
      });

      expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
    });

    it("scope=scoredTraces — project + scores.timestamp window semi-join", async () => {
      await getEventsExactFilterOptionsForColumns({
        projectId: FIXED_PROJECT_ID,
        filter: [],
        columns: COLUMNS,
        scope: {
          type: "scoredTraces",
          fromTime: { operator: ">=", value: FIXED_FROM_TIMESTAMP },
          toTime: { operator: "<=", value: FIXED_TO_TIMESTAMP },
        },
      });

      expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
    });
  },
);
