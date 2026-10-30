import { describe, expect, it } from "vitest";

import { type ColumnDefinition } from "../tableDefinitions";
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
