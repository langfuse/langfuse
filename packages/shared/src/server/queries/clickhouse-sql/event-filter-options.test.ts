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
  it("omits the count aggregate unless includeApproxCount is set (lazy per-facet path)", () => {
    const built = buildEventsFilterOptionsForColumnsQuery(base);
    expect(built).not.toBeNull();
    const query = built!.query;
    expect(query).not.toContain("approx_total_count");
    expect(query).not.toContain(EVENTS_APPROX_TOTAL_COUNT_MARKER);
  });

  it("counts distinct observations via uniq(span_id) — not uniq(trace_id)", () => {
    const built = buildEventsFilterOptionsForColumnsQuery({
      ...base,
      includeApproxCount: true,
    });
    const query = built!.query;
    // Distinct OBSERVATIONS (span_id), matching the rows the table shows — not
    // uniq(trace_id), which would undercount multi-observation traces.
    expect(query).toContain("uniq(e.span_id) AS approx_total_count");
    expect(query).not.toContain("uniq(e.trace_id)");
    // No conditional aggregate: the count rides the scan's own WHERE (= filter),
    // so it can never diverge from the rows the scan matches (post-LFE-14489).
    expect(query).not.toContain("uniqIf(");
    // Rides the facet scan, surfaced as a sentinel row (single query/scan).
    expect(query).toContain(EVENTS_APPROX_TOTAL_COUNT_MARKER);
    expect(query).toContain("aggregated_options");
  });

  it("is filter-aware through the shared scan WHERE (not a separate predicate)", () => {
    const built = buildEventsFilterOptionsForColumnsQuery({
      ...base,
      filter: [
        { column: "level", operator: "=", type: "string", value: "ERROR" },
      ],
      includeApproxCount: true,
    });
    const query = built!.query;
    // The count is plain uniq(span_id); filter-awareness comes from the facet
    // scan applying `filter` to its WHERE (level = {param}), which the count
    // then counts over.
    expect(query).toContain("uniq(e.span_id) AS approx_total_count");
    expect(query).toContain("e.level");
    expect(Object.values(built!.params)).toContain("ERROR");
  });
});
