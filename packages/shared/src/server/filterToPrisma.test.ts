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
