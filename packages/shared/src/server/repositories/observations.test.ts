import { describe, it, expect, beforeEach, vi } from "vitest";

const mockQueryClickhouse = vi.hoisted(() => vi.fn());

vi.mock("./clickhouse", () => ({
  queryClickhouse: mockQueryClickhouse,
  commandClickhouse: vi.fn(),
  queryClickhouseStream: vi.fn(),
  upsertClickhouse: vi.fn(),
  parseClickhouseUTCDateTimeFormat: vi.fn(),
  clickhouseCompliantRandomCharacters: vi.fn(() => "x"),
}));

import { getCostForTraces } from "./observations";

describe("getCostForTraces — cost-fallback SQL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryClickhouse.mockResolvedValue([{ total_cost: "0.0123" }]);
  });

  it("falls back to calculated_total_cost when caller-ingested total_cost is null", async () => {
    await getCostForTraces("proj-1", new Date("2026-07-17T00:00:00Z"), [
      "trace-a",
      "trace-b",
    ]);

    expect(mockQueryClickhouse).toHaveBeenCalledOnce();
    const { query } = mockQueryClickhouse.mock.calls[0][0];

    // Regression for #15109: caller-ingested total_cost is NULL for traces
    // whose cost is derived from the model price table. The session total
    // must roll up the resolved value (cost_details.materialized
    // calculated_total_cost) so it matches the metrics API.
    expect(query).toMatch(
      /COALESCE\(o\.total_cost,\s*o\.calculated_total_cost,\s*0\)\s+AS\s+total_cost/i,
    );
    // The CTE must still scan the legacy observations table; this is the
    // legacy path, not the v4 events aggregator.
    expect(query).toMatch(/FROM\s+observations\s+o/i);
  });

  it("preserves the zero-sum behaviour when no cost data exists at all", async () => {
    mockQueryClickhouse.mockResolvedValue([]);

    const result = await getCostForTraces(
      "proj-1",
      new Date("2026-07-17T00:00:00Z"),
      ["trace-missing"],
    );

    // No rows means the session cannot find cost info anywhere; the legacy
    // router maps that to `undefined` so the badge shows "$0.00" via the
    // existing nullish-coalesce at the call site.
    expect(result).toBeUndefined();

    expect(mockQueryClickhouse).toHaveBeenCalledOnce();
    const { query } = mockQueryClickhouse.mock.calls[0][0];
    // The trailing literal `0` in the COALESCE protects the case where
    // observations exist for the session's traces but both caller-ingested
    // total_cost and model-calculated calculated_total_cost are NULL on
    // every row. The empty-result case is handled separately: ClickHouse's
    // sum() returns 0 for an empty set, and the caller-side
    // `res.length > 0 ? ... : undefined` guard in observations.ts maps that
    // to `undefined` so the badge shows "$0.00". This test pins the
    // expression so future edits cannot regress the fallback arm.
    expect(query).toMatch(
      /COALESCE\(o\.total_cost,\s*o\.calculated_total_cost,\s*0\)/i,
    );
    expect(query).toMatch(/sum\(total_cost\)\s+as\s+total_cost/i);
  });
});