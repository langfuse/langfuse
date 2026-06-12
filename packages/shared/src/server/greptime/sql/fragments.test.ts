import { describe, expect, it } from "vitest";

import {
  greptimeAggregatedLevelRank,
  greptimeKnownKeySum,
  greptimeLatencyMs,
  greptimeLevelCounts,
  greptimeScoresAggCte,
} from "./fragments";

describe("greptimeLatencyMs", () => {
  it("spans earliest start to latest end in ms", () => {
    const sql = greptimeLatencyMs("o");
    expect(sql).toContain("greatest(max(o.end_time), max(o.start_time))");
    expect(sql).toContain("least(min(o.start_time), min(o.end_time))");
    expect(sql).toContain("AS BIGINT");
  });
});

describe("greptimeLevelCounts", () => {
  it("emits a CASE-sum per level", () => {
    const sql = greptimeLevelCounts("o");
    expect(sql).toContain(
      "sum(CASE WHEN o.level = 'ERROR' THEN 1 ELSE 0 END) AS error_count",
    );
    expect(sql).toContain("AS warning_count");
    expect(sql).toContain("AS default_count");
    expect(sql).toContain("AS debug_count");
  });
});

describe("greptimeAggregatedLevelRank", () => {
  it("ranks ERROR..DEBUG via max(CASE)", () => {
    const sql = greptimeAggregatedLevelRank("o");
    expect(sql).toContain("max(CASE o.level");
    expect(sql).toContain("WHEN 'ERROR' THEN 3");
    expect(sql).toContain("AS aggregated_level_rank");
  });
});

describe("greptimeKnownKeySum", () => {
  it("sums a known JSON key", () => {
    expect(
      greptimeKnownKeySum("cost_details", "input", "o", "cost_input"),
    ).toBe("sum(json_get_float(o.cost_details, 'input')) AS cost_input");
  });
});

describe("greptimeScoresAggCte", () => {
  it("groups by grain, encodes numeric as name::value and categorical as name:value, soft-delete aware", () => {
    const sql = greptimeScoresAggCte({
      cteName: "scores_agg",
      grainColumn: "trace_id",
      projectIdParam: "projectId",
    });
    expect(sql).toContain("scores_agg AS (");
    expect(sql).toContain("trace_id AS grain_id");
    expect(sql).toContain("project_id = :projectId");
    expect(sql).toContain("is_deleted = false");
    expect(sql).toContain("data_type IN ('NUMERIC', 'BOOLEAN')");
    expect(sql).toContain("concat(name, '::', CAST(avg_value AS STRING))");
    expect(sql).toContain("data_type = 'CATEGORICAL'");
    expect(sql).toContain("GROUP BY project_id, grain_id");
  });

  it("threads an extra filter into the inner scan", () => {
    const sql = greptimeScoresAggCte({
      cteName: "s_agg",
      grainColumn: "session_id",
      projectIdParam: "pid",
      filterSql: "s.environment = :env0",
    });
    expect(sql).toContain("session_id AS grain_id");
    expect(sql).toContain("s.environment = :env0");
  });
});
