import { describe, expect, it } from "vitest";

import { normalizeParams, splitConditions } from "./goldenHarness";

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

describe("splitConditions", () => {
  it("puts each top-level AND condition on its own line", () => {
    expect(
      splitConditions(
        [
          "SELECT x AND y",
          "FROM t",
          "    WHERE (a = 1) AND (if(b AND c, 1, 0) = 1) AND (s = 'p AND q')",
          "HAVING n > 1",
        ].join("\n"),
      ),
    ).toBe(
      [
        "SELECT x AND y",
        "FROM t",
        "    WHERE (a = 1)",
        "        AND (if(b AND c, 1, 0) = 1)",
        "        AND (s = 'p AND q')",
        "HAVING n > 1",
      ].join("\n"),
    );
  });

  it("ignores brackets in quotes and splits nothing inside an array", () => {
    expect(
      splitConditions(
        [
          "PREWHERE (s = 'p\\' (') AND (`x)` = 1) AND (z = 2)",
          'HAVING ("a(" = 1) AND [c AND d] = e',
        ].join("\n"),
      ),
    ).toBe(
      [
        "PREWHERE (s = 'p\\' (')",
        "    AND (`x)` = 1)",
        "    AND (z = 2)",
        'HAVING ("a(" = 1)',
        "    AND [c AND d] = e",
      ].join("\n"),
    );
  });

  it("indents a multi-line subquery under its AND and splits after it", () => {
    expect(
      splitConditions(
        [
          "WHERE (a = 1) AND (x IN (",
          "    SELECT x",
          "    FROM t",
          "    WHERE (b = 2) AND (c = 3)",
          ")) AND (d = 4) AND (y IN (",
          "    SELECT y",
          "))",
          "ORDER BY a ASC",
        ].join("\n"),
      ),
    ).toBe(
      [
        "WHERE (a = 1)",
        "    AND (x IN (",
        "        SELECT x",
        "        FROM t",
        "        WHERE (b = 2)",
        "            AND (c = 3)",
        "    ))",
        "    AND (d = 4)",
        "    AND (y IN (",
        "        SELECT y",
        "    ))",
        "ORDER BY a ASC",
      ].join("\n"),
    );
  });

  it("indents a later subquery when the first one opens on the WHERE line", () => {
    expect(
      splitConditions(
        [
          "WHERE (x IN (",
          "    SELECT x",
          ")) AND (y IN (",
          "    SELECT y",
          "))",
        ].join("\n"),
      ),
    ).toBe(
      [
        "WHERE (x IN (",
        "    SELECT x",
        "))",
        "    AND (y IN (",
        "        SELECT y",
        "    ))",
      ].join("\n"),
    );
  });

  it("keeps an OR-rooted clause on one line", () => {
    expect(splitConditions("WHERE (a AND b) OR c")).toBe(
      "WHERE (a AND b) OR c",
    );
  });
});
