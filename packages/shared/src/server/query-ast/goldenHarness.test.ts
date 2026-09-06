import { describe, expect, it } from "vitest";

import { normalizeParams } from "./goldenHarness";

// Pure logic — no `clickhouse` binary required, so this always runs.
describe("normalizeParams", () => {
  it("rewrites placeholders to positional tokens in first-occurrence order", () => {
    const { sql, params } = normalizeParams(
      "SELECT * FROM t WHERE project_id = {projectId:String} AND ts >= {fromTimestamp:DateTime64(3)}",
      { projectId: "p", fromTimestamp: "2026-01-01" },
    );
    expect(sql).toBe(
      "SELECT * FROM t WHERE project_id = {param1:String} AND ts >= {param2:DateTime64(3)}",
    );
    expect(params).toEqual({ param1: "p", param2: "2026-01-01" });
  });

  it("collapses random-suffixed names that repeat to one stable token", () => {
    const { sql, params } = normalizeParams(
      "SELECT {p_a1b2:String}, {p_a1b2:String}",
      { p_a1b2: "x" },
    );
    expect(sql).toBe("SELECT {param1:String}, {param1:String}");
    expect(params).toEqual({ param1: "x" });
  });

  it("drops params not referenced in the SQL", () => {
    const { params } = normalizeParams("SELECT {used:String}", {
      used: "y",
      unused: "z",
    });
    expect(params).toEqual({ param1: "y" });
  });
});
