import { describe, expect, it } from "vitest";

import type { ColumnDefinition } from "../tableDefinitions/types";
import { type FilterState } from "../types";
import { tableColumnsToSqlFilter } from "./filterToPrisma";

const metadataCol: ColumnDefinition = {
  name: "metadata",
  id: "metadata",
  type: "stringObject",
  internal: "di.metadata",
};

const build = (operator: "is set" | "is not set") =>
  tableColumnsToSqlFilter(
    [
      {
        type: "stringObject",
        column: "metadata",
        key: "env",
        operator,
        value: "",
      },
    ] as FilterState,
    [metadataCol],
    "dataset_items",
  );

describe("tableColumnsToSqlFilter metadata presence operators", () => {
  it("compiles `is set` to a jsonb key-existence check with the key bound as a param", () => {
    const sql = build("is set");
    expect(sql.sql).toContain("jsonb_exists");
    expect(sql.sql).toContain("::jsonb");
    expect(sql.sql).not.toMatch(/\bis set\b/);
    expect(sql.values).toContain("env");
  });

  it("compiles `is not set` to a negated key-existence check", () => {
    const sql = build("is not set");
    expect(sql.sql).toContain("jsonb_exists");
    expect(sql.sql).toContain("NOT");
    expect(sql.sql).not.toMatch(/\bis not set\b/);
    expect(sql.values).toContain("env");
  });
});

describe("tableColumnsToSqlFilter LIKE wildcards", () => {
  const nameCol: ColumnDefinition = {
    name: "Name",
    id: "name",
    type: "string",
    internal: 'p."name"',
  };

  const buildString = (
    operator:
      | "="
      | "contains"
      | "does not contain"
      | "starts with"
      | "ends with",
    value: string,
  ) =>
    tableColumnsToSqlFilter(
      [{ type: "string", column: "name", operator, value }] as FilterState,
      [nameCol],
      "prompts",
    );

  it.each([
    "contains",
    "does not contain",
    "starts with",
    "ends with",
  ] as const)("escapes LIKE wildcards for `%s`", (operator) => {
    const sql = buildString(operator, "team_a/100%\\x");
    expect(sql.sql).toContain("ILIKE");
    expect(sql.values).toEqual(["team\\_a/100\\%\\\\x"]);
  });

  it("keeps the value unescaped for `=`", () => {
    const sql = buildString("=", "team_a/100%");
    expect(sql.values).toEqual(["team_a/100%"]);
  });

  it("escapes the value of a stringObject filter", () => {
    const sql = tableColumnsToSqlFilter(
      [
        {
          type: "stringObject",
          column: "metadata",
          key: "env",
          operator: "contains",
          value: "prod_eu",
        },
      ] as FilterState,
      [metadataCol],
      "dataset_items",
    );
    expect(sql.values).toEqual(["env", "prod\\_eu"]);
  });
});

describe("tableColumnsToSqlFilter empty option filters", () => {
  const tagsCol: ColumnDefinition = {
    name: "Tags",
    id: "tags",
    type: "arrayOptions",
    internal: 'p."tags"',
    options: [],
  };
  const nameCol: ColumnDefinition = {
    name: "Name",
    id: "name",
    type: "string",
    internal: 'p."name"',
  };

  const emptyTags = (operator: "all of" | "none of"): FilterState => [
    {
      type: "arrayOptions",
      column: "tags",
      operator,
      value: [],
    },
  ];

  it.each(["all of", "none of"] as const)(
    "treats empty arrayOptions `%s` as a no-op instead of throwing",
    (operator) => {
      const sql = tableColumnsToSqlFilter(
        emptyTags(operator),
        [tagsCol],
        "prompts",
      );
      expect(sql.sql).toBe("");
      expect(sql.values).toEqual([]);
    },
  );

  it("keeps a sibling filter when empty all-of is waiting for selection", () => {
    const sql = tableColumnsToSqlFilter(
      [
        ...emptyTags("all of"),
        {
          type: "string",
          column: "name",
          operator: "contains",
          value: "welcome",
        },
      ] as FilterState,
      [tagsCol, nameCol],
      "prompts",
    );
    expect(sql.sql).toContain("ILIKE");
    expect(sql.sql).not.toContain("ARRAY");
    expect(sql.values).toEqual(["welcome"]);
  });
});
