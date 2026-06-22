import { describe, expect, it } from "vitest";

import {
  buildEventsFullTableSplitQuery,
  EventsQueryBuilder,
} from "./event-query-builder";

describe("buildEventsFullTableSplitQuery", () => {
  const buildBase = () =>
    new EventsQueryBuilder({ projectId: "test-project" })
      .selectFieldSet("core")
      .whereRaw("e.trace_id = {traceId: String}", { traceId: "trace-1" })
      .orderByColumns([{ column: "e.start_time", direction: "DESC" }])
      .limit(51, undefined);

  it("joins the io CTE with LEFT ANY JOIN (no row fan-out)", () => {
    const { query } = buildEventsFullTableSplitQuery({
      projectId: "test-project",
      baseBuilder: buildBase(),
      includeIO: true,
      includeMetadata: true,
    }).buildWithParams();

    // ANY takes exactly one matching io row per base row, preventing the
    // N_base x N_io amplification a plain LEFT JOIN produces on un-merged
    // ReplacingMergeTree duplicates.
    expect(query).toContain(
      'LEFT ANY JOIN io i ON b."start_time" = i."_io_start_time"',
    );
    expect(query).not.toMatch(/\bLEFT JOIN io\b/);
    // io columns come from the joined events_full CTE.
    expect(query).toContain("i.input as input");
    expect(query).toContain("i.output as output");
    expect(query).toContain("i.metadata as metadata");
  });
});
