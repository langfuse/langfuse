import { describe, expect, it } from "vitest";

import {
  ArrayOptionsFilter,
  BooleanFilter,
  CategoryOptionsFilter,
  DateTimeFilter,
  FilterList,
  NullFilter,
  NumberFilter,
  NumberObjectFilter,
  ScoreNumberObjectFilter,
  StringFilter,
  StringObjectFilter,
  StringOptionsFilter,
} from "./greptime-filter";

// Param names are random; normalise placeholders for stable structural assertions.
const norm = (q: string) => q.replace(/:[A-Za-z][A-Za-z0-9]*/g, ":P");

describe("GreptimeFilter scalar columns", () => {
  it("quotes identifiers and binds equality", () => {
    const { query, params } = new StringFilter({
      table: "traces",
      field: "user_id",
      operator: "=",
      value: "u1",
      tablePrefix: "t",
    }).apply();
    expect(norm(query)).toBe("t.`user_id` = :P");
    expect(Object.values(params)).toEqual(["u1"]);
  });

  it("translates contains to a LIKE with an escaped %value%", () => {
    const { query, params } = new StringFilter({
      table: "traces",
      field: "name",
      operator: "contains",
      value: "a%b",
    }).apply();
    expect(norm(query)).toBe("`name` LIKE :P");
    expect(Object.values(params)[0]).toBe("%a\\%b%");
  });

  it("null-guards 'does not contain'", () => {
    const { query } = new StringFilter({
      table: "traces",
      field: "name",
      operator: "does not contain",
      value: "x",
    }).apply();
    expect(norm(query)).toBe("(`name` IS NULL OR `name` NOT LIKE :P)");
  });

  it("uses matches_term on a fulltext-indexed column, lower(LIKE) otherwise", () => {
    expect(
      norm(
        new StringFilter({
          table: "traces",
          field: "input",
          operator: "matches",
          value: "hi",
          fullTextIndexed: true,
        }).apply().query,
      ),
    ).toBe("matches_term(`input`, :P)");
    expect(
      norm(
        new StringFilter({
          table: "traces",
          field: "input",
          operator: "matches",
          value: "hi",
        }).apply().query,
      ),
    ).toBe("lower(`input`) LIKE lower(:P)");
  });

  it("binds datetime as a ms-precision timestamp literal", () => {
    const { query, params } = new DateTimeFilter({
      table: "traces",
      field: "timestamp",
      operator: ">=",
      value: new Date("2026-06-01T08:00:00.123Z"),
      tablePrefix: "t",
    }).apply();
    expect(norm(query)).toBe("t.`timestamp` >= :P");
    expect(Object.values(params)[0]).toBe("2026-06-01 08:00:00.123");
  });

  it("expands string options into an explicit named IN list", () => {
    const { query, params } = new StringOptionsFilter({
      table: "traces",
      field: "environment",
      operator: "any of",
      values: ["prod", "staging"],
    }).apply();
    expect(norm(query)).toBe("`environment` IN (:P, :P)");
    expect(Object.values(params).sort()).toEqual(["prod", "staging"]);
  });

  it("keeps empty string option sets compatible with set semantics", () => {
    expect(
      new StringOptionsFilter({
        table: "traces",
        field: "environment",
        operator: "any of",
        values: [],
      }).apply(),
    ).toEqual({ query: "1 = 0", params: {} });

    expect(
      new StringOptionsFilter({
        table: "traces",
        field: "environment",
        operator: "none of",
        values: [],
      }).apply(),
    ).toEqual({ query: "1 = 1", params: {} });
  });

  it("preserves emptyEqualsNull guard for empty none-of string option sets", () => {
    const { query } = new StringOptionsFilter({
      table: "traces",
      field: "user_id",
      operator: "none of",
      values: [],
      emptyEqualsNull: true,
    }).apply();
    expect(query).toBe("(1 = 1 AND `user_id` != '')");
  });

  it("maps boolean <> to !=", () => {
    expect(
      norm(
        new BooleanFilter({
          table: "traces",
          field: "bookmarked",
          operator: "<>",
          value: true,
        }).apply().query,
      ),
    ).toBe("`bookmarked` != :P");
  });

  it("emptyEqualsNull null filter", () => {
    expect(
      new NullFilter({
        table: "traces",
        field: "user_id",
        operator: "is null",
        emptyEqualsNull: true,
      }).apply().query,
    ).toBe("(`user_id` = '' OR `user_id` IS NULL)");
  });
});

describe("GreptimeFilter EAV semi-joins (tenant isolation)", () => {
  it("metadata '=' is a project-scoped, soft-delete-aware EXISTS", () => {
    const { query, params } = new StringObjectFilter({
      table: "traces",
      field: "metadata",
      operator: "=",
      key: "env",
      value: "prod",
      tablePrefix: "t",
    }).apply();
    const n = norm(query);
    // CRITICAL: subquery must correlate BOTH project_id and entity id (no cross-project leak).
    expect(n).toContain("EXISTS (SELECT 1 FROM `traces_metadata` m");
    expect(n).toContain("m.`project_id` = t.`project_id`");
    expect(n).toContain("m.`entity_id` = t.`id`");
    expect(n).toContain("m.`key` = :P");
    expect(n).toContain("m.`value` = :P");
    expect(n).toContain("m.`is_deleted` = false");
    expect(Object.values(params).sort()).toEqual(["env", "prod"]);
  });

  it("metadata 'does not contain' is NOT EXISTS (missing key matches, like CH map)", () => {
    const { query } = new StringObjectFilter({
      table: "traces",
      field: "metadata",
      operator: "does not contain",
      key: "env",
      value: "prod",
      tablePrefix: "t",
    }).apply();
    const n = norm(query);
    expect(n).toContain("NOT EXISTS (SELECT 1 FROM `traces_metadata` m");
    expect(n).toContain("m.`value` LIKE :P"); // positive containment, negated by NOT EXISTS
  });

  it("metadata 'contains' uses LIKE inside the EXISTS", () => {
    const { query } = new StringObjectFilter({
      table: "observations",
      field: "metadata",
      operator: "contains",
      key: "k",
      value: "v",
      tablePrefix: "o",
    }).apply();
    const n = norm(query);
    expect(n).toContain("FROM `observations_metadata` m");
    expect(n).toContain("m.`project_id` = o.`project_id`");
    expect(n).toContain("m.`value` LIKE :P");
  });

  it("numeric metadata casts the EAV value to DOUBLE", () => {
    const { query } = new NumberObjectFilter({
      table: "traces",
      field: "metadata",
      operator: ">",
      key: "score",
      value: 5,
      tablePrefix: "t",
    }).apply();
    expect(norm(query)).toContain("CAST(m.`value` AS DOUBLE) > :P");
  });

  it("tags 'any of' -> EXISTS over the tags EAV", () => {
    const { query } = new ArrayOptionsFilter({
      table: "traces",
      field: "tags",
      operator: "any of",
      values: ["a", "b"],
      tablePrefix: "t",
    }).apply();
    const n = norm(query);
    expect(n).toContain("EXISTS (SELECT 1 FROM `traces_tags` m");
    expect(n).toContain("m.`tag` IN (:P, :P)");
  });

  it("tags 'none of' -> NOT EXISTS", () => {
    expect(
      norm(
        new ArrayOptionsFilter({
          table: "traces",
          field: "tags",
          operator: "none of",
          values: ["a"],
          tablePrefix: "t",
        }).apply().query,
      ),
    ).toContain("NOT EXISTS (SELECT 1 FROM `traces_tags` m");
  });

  it("tags 'all of' -> AND of per-tag EXISTS", () => {
    const { query } = new ArrayOptionsFilter({
      table: "traces",
      field: "tags",
      operator: "all of",
      values: ["a", "b"],
      tablePrefix: "t",
    }).apply();
    expect((query.match(/EXISTS/g) ?? []).length).toBe(2);
    expect(query).toContain(" AND ");
  });
});

describe("FilterList", () => {
  it("AND-joins and merges params", () => {
    const list = new FilterList([
      new StringFilter({
        table: "traces",
        field: "user_id",
        operator: "=",
        value: "u",
      }),
      new BooleanFilter({
        table: "traces",
        field: "public",
        operator: "=",
        value: true,
      }),
    ]);
    const { query, params } = list.apply();
    expect(query.includes(" AND ")).toBe(true);
    expect(Object.keys(params).length).toBe(2);
  });

  it("empty list yields an empty clause", () => {
    expect(new FilterList().apply()).toEqual({ query: "", params: {} });
  });
});

describe("GreptimeFilter expression-valued fields (rollup columns)", () => {
  it("emits an already-qualified expression verbatim instead of quoting it", () => {
    const { query } = new NumberFilter({
      table: "observations",
      field: "o.latency_milliseconds / 1000",
      operator: ">=",
      value: 5,
    }).apply();
    expect(norm(query)).toBe("o.latency_milliseconds / 1000 >= :P");
  });

  it("emits a qualified rollup ref verbatim for IN lists", () => {
    const { query } = new StringOptionsFilter({
      table: "observations",
      field: "o.aggregated_level",
      operator: "any of",
      values: ["ERROR", "WARNING"],
    }).apply();
    expect(norm(query)).toBe("o.aggregated_level IN (:P, :P)");
  });
});

describe("CategoryOptionsFilter (score grain)", () => {
  const grain = {
    scoresColumn: "trace_id" as const,
    outerPrefix: "t",
    outerColumn: "id",
  };

  it("builds a project-scoped, soft-delete-aware EXISTS correlated by the grain", () => {
    const { query, params } = new CategoryOptionsFilter({
      key: "sentiment",
      values: ["positive", "negative"],
      operator: "any of",
      grain,
    }).apply();
    expect(query).toContain("EXISTS (SELECT 1 FROM `scores` cs");
    expect(query).toContain("cs.`project_id` = t.`project_id`");
    expect(query).toContain("cs.`trace_id` = t.`id`");
    expect(query).toContain("cs.`name` = :");
    expect(query).toContain("cs.`data_type` = 'CATEGORICAL'");
    expect(query).toContain("cs.`string_value` IN (");
    expect(query).toContain("cs.`is_deleted` = false");
    expect(Object.values(params)).toEqual([
      "sentiment",
      "positive",
      "negative",
    ]);
  });

  it("negates to NOT EXISTS for 'none of' (missing score matches)", () => {
    const { query } = new CategoryOptionsFilter({
      key: "sentiment",
      values: ["positive"],
      operator: "none of",
      grain,
    }).apply();
    expect(query.startsWith("NOT EXISTS (")).toBe(true);
  });

  it("short-circuits on an empty value list", () => {
    expect(
      new CategoryOptionsFilter({
        key: "x",
        values: [],
        operator: "any of",
        grain,
      }).apply().query,
    ).toBe("1 = 0");
    expect(
      new CategoryOptionsFilter({
        key: "x",
        values: [],
        operator: "none of",
        grain,
      }).apply().query,
    ).toBe("1 = 1");
  });
});

describe("ScoreNumberObjectFilter (score grain)", () => {
  const grain = {
    scoresColumn: "trace_id" as const,
    outerPrefix: "t",
    outerColumn: "id",
  };

  it("builds a grouped EXISTS with HAVING avg(value) over numeric/boolean scores", () => {
    const { query, params } = new ScoreNumberObjectFilter({
      key: "quality",
      value: 0.8,
      operator: ">=",
      grain,
    }).apply();
    expect(query).toContain("EXISTS (SELECT 1 FROM `scores` cs");
    expect(query).toContain("cs.`trace_id` = t.`id`");
    expect(query).toContain("cs.`data_type` IN ('NUMERIC', 'BOOLEAN')");
    expect(query).toContain("GROUP BY cs.`name` HAVING avg(cs.`value`) >= :");
    expect(Object.values(params)).toEqual(["quality", 0.8]);
  });
});
