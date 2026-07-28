import { describe, expect, it } from "vitest";

import type { FilterState } from "../../../types";
import {
  buildEventsFilterOptionsForColumnsQuery,
  EVENTS_APPROX_TOTAL_COUNT_MARKER,
} from "./event-filter-options";

const base = {
  projectId: "test-project",
  filter: [] as FilterState,
  columns: ["level", "type"] as const,
  limit: 1000,
};

describe("buildEventsFilterOptionsForColumnsQuery — approximate total count", () => {
  it("omits the count aggregate when no countFilter is given (lazy per-facet path)", () => {
    const built = buildEventsFilterOptionsForColumnsQuery(base);
    expect(built).not.toBeNull();
    const query = built!.query;
    expect(query).not.toContain("approx_total_count");
    expect(query).not.toContain(EVENTS_APPROX_TOTAL_COUNT_MARKER);
  });

  it("counts distinct observations via uniq(span_id) when countFilter is empty", () => {
    const built = buildEventsFilterOptionsForColumnsQuery({
      ...base,
      countFilter: [],
    });
    const query = built!.query;
    // Distinct OBSERVATIONS (span_id), matching the rows the table shows — not
    // uniq(trace_id), which would undercount multi-observation traces.
    expect(query).toContain("uniq(e.span_id) AS approx_total_count");
    // Rides the facet scan (single filter-options query), surfaced as a
    // sentinel row rather than a second query/scan.
    expect(query).toContain(EVENTS_APPROX_TOTAL_COUNT_MARKER);
    expect(query).toContain("aggregated_options");
  });

  it("applies the active filter as a uniqIf predicate (filter-aware count)", () => {
    const built = buildEventsFilterOptionsForColumnsQuery({
      ...base,
      countFilter: [
        {
          column: "level",
          operator: "=",
          type: "string",
          value: "ERROR",
        },
      ],
    });
    const query = built!.query;
    // Filter-aware: the count re-applies the full active filter via uniqIf,
    // even though the facet scan's own WHERE self-excludes it.
    expect(query).toMatch(/uniqIf\(e\.span_id,/);
    expect(query).not.toContain("uniq(e.span_id) AS approx_total_count");
    // The ERROR value is bound as a parameter, and the predicate targets level.
    expect(query).toContain("e.level");
    expect(Object.values(built!.params)).toContain("ERROR");
  });
});
