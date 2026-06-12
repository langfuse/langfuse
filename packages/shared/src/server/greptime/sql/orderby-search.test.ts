import { describe, expect, it } from "vitest";

import type { GreptimeColumnMappings } from "./columnMappings";
import { greptimeOrderBySql } from "./orderby";
import { greptimeSearchCondition } from "./search";

const cols: GreptimeColumnMappings = [
  {
    uiTableName: "Timestamp",
    uiTableId: "timestamp",
    greptimeSelect: "timestamp",
    queryPrefix: "t",
    greptimeTableName: "traces",
  },
  {
    uiTableName: "Name",
    uiTableId: "name",
    greptimeSelect: "name",
    queryPrefix: "t",
    greptimeTableName: "traces",
  },
  {
    uiTableName: "Date",
    uiTableId: "ts_date",
    greptimeSelect: "date_trunc('day', t.timestamp)",
    queryPrefix: undefined,
    greptimeTableName: "traces",
  },
];

describe("greptimeOrderBySql", () => {
  it("quotes a bare column and prefixes it", () => {
    expect(
      greptimeOrderBySql({ column: "timestamp", order: "DESC" }, cols),
    ).toBe("ORDER BY t.`timestamp` DESC");
  });

  it("emits expression columns verbatim (no quoting)", () => {
    expect(greptimeOrderBySql({ column: "ts_date", order: "ASC" }, cols)).toBe(
      "ORDER BY date_trunc('day', t.timestamp) ASC",
    );
  });

  it("wraps in any() only when aggregating (no anyLast)", () => {
    expect(
      greptimeOrderBySql({ column: "name", order: "ASC" }, cols, true),
    ).toBe("ORDER BY any(t.`name`) ASC");
  });

  it("returns empty for no orderBy", () => {
    expect(greptimeOrderBySql([], cols)).toBe("");
    expect(greptimeOrderBySql(null, cols)).toBe("");
  });
});

describe("greptimeSearchCondition", () => {
  it("is empty without a query", () => {
    expect(greptimeSearchCondition({})).toEqual({ query: "", params: {} });
  });

  it("searches id columns case-insensitively by default", () => {
    const { query, params } = greptimeSearchCondition({
      query: "foo",
      searchType: ["id"],
      tablePrefix: "t",
    });
    expect(query).toContain("lower(t.`id`) LIKE lower(:");
    expect(query).toContain("lower(t.`user_id`)");
    expect(Object.values(params).every((p) => p === "%foo%")).toBe(true);
  });

  it("adds an escaped variant for non-ASCII content search", () => {
    const { query, params } = greptimeSearchCondition({
      query: "你好",
      searchType: ["content"],
      tablePrefix: "t",
    });
    // both raw and \\uXXXX-escaped forms searched on input + output
    expect(query).toContain("lower(t.`input`)");
    expect(query).toContain("lower(t.`output`)");
    // raw form
    expect(Object.values(params)).toContain("%你好%");
    // escaped form: \uXXXX with backslashes SQL-escaped (doubled) so LIKE matches the literal
    // backslash stored by an ensure_ascii serializer.
    expect(
      Object.values(params).some(
        (p) => p.includes("u4f60") && p.includes("u597d") && p.includes("\\\\"),
      ),
    ).toBe(true);
  });
});
