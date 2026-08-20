/**
 * Non-ASCII values in input/output string filters must also match payloads
 * persisted in the `\uXXXX`-escaped form written by `ensure_ascii=True` JSON
 * serializers (Python SDK / OTel ingestion). The free-text search path already
 * does this (see search.ts, issue #11538); these tests pin the same behavior
 * for the column filters the search bar and table filters lower to
 * (issue #15072: `position(e.input, '内部') > 0` never matches escaped
 * storage).
 */
import { describe, expect, it } from "vitest";

import { StringFilter } from "./clickhouse-filter";

const applyFilter = (
  overrides: Partial<ConstructorParameters<typeof StringFilter>[0]> = {},
) =>
  new StringFilter({
    clickhouseTable: "events_core",
    field: "input",
    operator: "contains",
    value: "内部",
    tablePrefix: "e",
    ...overrides,
  }).apply();

const paramValues = (params: Record<string, unknown>) => Object.values(params);

describe("StringFilter unicode-escaped variant for IO fields (#15072)", () => {
  it("contains on input with non-ASCII value matches raw and escaped forms", () => {
    const { query, params } = applyFilter();

    expect(query).toMatch(
      /^\(position\(e\.input, \{stringFilter\w+: String\}\) > 0 OR position\(e\.input, \{stringFilter\w+Escaped: String\}\) > 0\)$/,
    );
    expect(paramValues(params)).toEqual(
      expect.arrayContaining(["内部", "\\u5185\\u90e8"]),
    );
  });

  it("does not contain must exclude both forms (AND, not OR)", () => {
    const { query, params } = applyFilter({ operator: "does not contain" });

    expect(query).toMatch(
      /^\(position\(e\.input, \{stringFilter\w+: String\}\) = 0 AND position\(e\.input, \{stringFilter\w+Escaped: String\}\) = 0\)$/,
    );
    expect(paramValues(params)).toEqual(
      expect.arrayContaining(["内部", "\\u5185\\u90e8"]),
    );
  });

  it("starts with / ends with match either form", () => {
    const startsWith = applyFilter({ operator: "starts with" });
    expect(startsWith.query).toMatch(
      /^\(startsWith\(e\.input, \{stringFilter\w+: String\}\) OR startsWith\(e\.input, \{stringFilter\w+Escaped: String\}\)\)$/,
    );

    const endsWith = applyFilter({ operator: "ends with", field: "output" });
    expect(endsWith.query).toMatch(
      /^\(endsWith\(e\.output, \{stringFilter\w+: String\}\) OR endsWith\(e\.output, \{stringFilter\w+Escaped: String\}\)\)$/,
    );
  });

  it("ASCII values keep the single-variant query and params", () => {
    const { query, params } = applyFilter({ value: "internal" });

    expect(query).toMatch(
      /^position\(e\.input, \{stringFilter\w+: String\}\) > 0$/,
    );
    expect(paramValues(params)).toEqual(["internal"]);
  });

  it("non-IO fields are unaffected even with non-ASCII values", () => {
    const { query, params } = applyFilter({
      clickhouseTable: "traces",
      field: "user_id",
      tablePrefix: "t",
    });

    expect(query).toMatch(
      /^position\(t\.user_id, \{stringFilter\w+: String\}\) > 0$/,
    );
    expect(paramValues(params)).toEqual(["内部"]);
  });

  it("astral code points escape as surrogate pairs", () => {
    const { params } = applyFilter({ value: "🍜" });

    expect(paramValues(params)).toEqual(
      expect.arrayContaining(["🍜", "\\ud83c\\udf5c"]),
    );
  });
});
