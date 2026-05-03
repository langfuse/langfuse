import { NULL_IF_EMPTY_RE } from "@/src/features/query/server/nullIfEmptyFilter";
import {
  StringFilter,
  StringOptionsFilter,
  NullFilter,
} from "@langfuse/shared/src/server";

// ─── NULL_IF_EMPTY_RE ───────────────────────────────────────────────────────

describe("NULL_IF_EMPTY_RE", () => {
  it.each<{ input: string; match: string | null }>([
    {
      input: "nullIf(events_traces.user_id, '')",
      match: "events_traces.user_id",
    },
    { input: "nullIf(col,  '')", match: "col" },
    {
      input:
        "COALESCE(nullIf(events_traces.trace_name, ''), nullIf(events_traces.name, ''))",
      match: null,
    },
    { input: "events_traces.user_id", match: null },
  ])("$input → $match", ({ input, match }) => {
    const m = NULL_IF_EMPTY_RE.exec(input);
    if (match === null) {
      expect(m).toBeNull();
    } else {
      expect(m).not.toBeNull();
      expect(m![1]).toBe(match);
    }
  });
});

// ─── Filter classes with emptyEqualsNull ────────────────────────────────────

const C = "t.user_id";

/** Replace random param names like `stringFilterAb3x` with `P` for stable assertions. */
const norm = (sql: string) =>
  sql.replace(/string(Filter|OptionsFilter)\w+/g, "P");

describe("StringFilter with emptyEqualsNull", () => {
  it.each<{
    desc: string;
    operator:
      | "="
      | "contains"
      | "does not contain"
      | "starts with"
      | "ends with";
    value: string;
    expectedQuery: string;
    paramValues: unknown[];
  }>([
    {
      desc: "= non-empty (unchanged)",
      operator: "=",
      value: "alice",
      expectedQuery: `${C} = {P: String}`,
      paramValues: ["alice"],
    },
    {
      desc: "= empty → match '' and NULL",
      operator: "=",
      value: "",
      expectedQuery: `(${C} = '' OR ${C} IS NULL)`,
      paramValues: [],
    },
    {
      desc: "contains (unchanged)",
      operator: "contains",
      value: "ali",
      expectedQuery: `position(${C}, {P: String}) > 0`,
      paramValues: ["ali"],
    },
    {
      desc: "does not contain → guard empty",
      operator: "does not contain",
      value: "ali",
      expectedQuery: `(${C} != '' AND position(${C}, {P: String}) = 0)`,
      paramValues: ["ali"],
    },
    {
      desc: "contains empty → match '' and NULL",
      operator: "contains",
      value: "",
      expectedQuery: `(${C} = '' OR ${C} IS NULL)`,
      paramValues: [],
    },
    {
      desc: "starts with (unchanged)",
      operator: "starts with",
      value: "ali",
      expectedQuery: `startsWith(${C}, {P: String})`,
      paramValues: ["ali"],
    },
    {
      desc: "starts with empty → match '' and NULL",
      operator: "starts with",
      value: "",
      expectedQuery: `(${C} = '' OR ${C} IS NULL)`,
      paramValues: [],
    },
    {
      desc: "ends with (unchanged)",
      operator: "ends with",
      value: "ice",
      expectedQuery: `endsWith(${C}, {P: String})`,
      paramValues: ["ice"],
    },
    {
      desc: "ends with empty → match '' and NULL",
      operator: "ends with",
      value: "",
      expectedQuery: `(${C} = '' OR ${C} IS NULL)`,
      paramValues: [],
    },
  ])("$desc", ({ operator, value, expectedQuery, paramValues }) => {
    const { query, params } = new StringFilter({
      clickhouseTable: "",
      field: C,
      operator,
      value,
      emptyEqualsNull: true,
    }).apply();

    expect(norm(query)).toBe(expectedQuery);
    expect(Object.values(params)).toEqual(paramValues);
  });
});

describe("StringOptionsFilter with emptyEqualsNull", () => {
  it.each<{
    desc: string;
    operator: "any of" | "none of";
    values: string[];
    expectedQuery: string;
    paramValues: unknown[];
  }>([
    {
      desc: "any of (no empty, unchanged)",
      operator: "any of",
      values: ["a", "b"],
      expectedQuery: `${C} IN ({P: Array(String)})`,
      paramValues: [["a", "b"]],
    },
    {
      desc: "any of (with empty) → OR IS NULL",
      operator: "any of",
      values: ["", "a"],
      expectedQuery: `(${C} IN ({P: Array(String)}) OR ${C} IS NULL)`,
      paramValues: [["", "a"]],
    },
    {
      desc: "none of (no empty) → AND != ''",
      operator: "none of",
      values: ["a"],
      expectedQuery: `(${C} NOT IN ({P: Array(String)}) AND ${C} != '')`,
      paramValues: [["a"]],
    },
    {
      desc: "none of (with empty) → AND IS NOT NULL",
      operator: "none of",
      values: ["", "a"],
      expectedQuery: `(${C} NOT IN ({P: Array(String)}) AND ${C} IS NOT NULL)`,
      paramValues: [["", "a"]],
    },
  ])("$desc", ({ operator, values, expectedQuery, paramValues }) => {
    const { query, params } = new StringOptionsFilter({
      clickhouseTable: "",
      field: C,
      operator,
      values,
      emptyEqualsNull: true,
    }).apply();

    expect(norm(query)).toBe(expectedQuery);
    expect(Object.values(params)).toEqual(paramValues);
  });
});

describe("NullFilter with emptyEqualsNull", () => {
  it.each<{
    desc: string;
    operator: "is null" | "is not null";
    expectedQuery: string;
  }>([
    {
      desc: "is null → match '' and NULL",
      operator: "is null",
      expectedQuery: `(${C} = '' OR ${C} IS NULL)`,
    },
    {
      desc: "is not null → exclude '' and NULL",
      operator: "is not null",
      expectedQuery: `(${C} != '' AND ${C} IS NOT NULL)`,
    },
  ])("$desc", ({ operator, expectedQuery }) => {
    const { query, params } = new NullFilter({
      clickhouseTable: "",
      field: C,
      operator,
      emptyEqualsNull: true,
    }).apply();

    expect(query).toBe(expectedQuery);
    expect(params).toEqual({});
  });
});
