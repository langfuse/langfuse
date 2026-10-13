import { describe, expect, it } from "vitest";

import { StringFilter, StringOptionsFilter } from "./clickhouse-filter";

// events_full carries ngrambf_v1 skip indexes on lower(name)/lower(user_id)/
// lower(session_id). These tests pin that the filter classes emit an
// index-usable lower() predicate for those columns on events-family tables,
// while keeping the exact (case-sensitive) predicate for correctness.

const stringFilter = (
  field: string,
  operator: StringFilter["operator"],
  value: string,
  clickhouseTable = "events_proto",
) =>
  new StringFilter({
    clickhouseTable,
    field,
    operator,
    value,
    tablePrefix: "e",
  }).apply();

describe("StringFilter ngram column acceleration (events_full)", () => {
  it("wraps `=` with a lower() equality conjunct plus the exact match", () => {
    const { query } = stringFilter("name", "=", "MyName");
    expect(query).toContain("lower(e.name) = lower({");
    expect(query).toContain("e.name = {");
  });

  it("adds a lower() LIKE prefilter for `contains`", () => {
    const { query, params } = stringFilter("user_id", "contains", "abc");
    expect(query).toContain("lower(e.user_id) LIKE lower({");
    expect(query).toContain("position(e.user_id, {");
    expect(Object.values(params)).toContain("%abc%");
  });

  it("uses a suffix wildcard for `starts with`", () => {
    const { query, params } = stringFilter("session_id", "starts with", "sess");
    expect(query).toContain("lower(e.session_id) LIKE lower({");
    expect(query).toContain("startsWith(e.session_id, {");
    expect(Object.values(params)).toContain("sess%");
  });

  it("uses a prefix wildcard for `ends with`", () => {
    const { query, params } = stringFilter("name", "ends with", "tail");
    expect(query).toContain("lower(e.name) LIKE lower({");
    expect(query).toContain("endsWith(e.name, {");
    expect(Object.values(params)).toContain("%tail");
  });

  it("escapes LIKE wildcards in the ngram pattern", () => {
    const { params } = stringFilter("name", "contains", "50%_off");
    expect(Object.values(params)).toContain("%50\\%\\_off%");
  });

  it("does not accelerate `does not contain` (bloom cannot prune negation)", () => {
    const { query } = stringFilter("name", "does not contain", "abc");
    expect(query).not.toContain("lower(");
  });

  it("leaves non-events tables untouched", () => {
    const { query } = stringFilter("name", "=", "MyName", "traces");
    expect(query).not.toContain("lower(");
    expect(query).toContain("e.name = {");
  });

  it("leaves the trace_name COALESCE column untouched (handled separately)", () => {
    // trace_name maps to a COALESCE expression, not a bare column; a simple
    // lower() wrap cannot use the index, so it is deliberately excluded here.
    const { query } = stringFilter("trace_name", "=", "MyTrace");
    expect(query).not.toContain("lower(");
  });
});

describe("StringOptionsFilter ngram column acceleration (events_full)", () => {
  it("adds a lowered IN prefilter for `any of`", () => {
    const { query, params } = new StringOptionsFilter({
      clickhouseTable: "events_proto",
      field: "name",
      operator: "any of",
      values: ["Foo", "BAR"],
      tablePrefix: "e",
    }).apply();
    expect(query).toContain("lower(e.name) IN ({");
    expect(query).toContain("e.name IN ({");
    expect(Object.values(params)).toContainEqual(["foo", "bar"]);
  });

  it("does not accelerate `none of` (NOT IN cannot be pruned)", () => {
    const { query } = new StringOptionsFilter({
      clickhouseTable: "events_proto",
      field: "name",
      operator: "none of",
      values: ["Foo"],
      tablePrefix: "e",
    }).apply();
    expect(query).not.toContain("lower(");
  });

  it("leaves non-events tables untouched", () => {
    const { query } = new StringOptionsFilter({
      clickhouseTable: "traces",
      field: "name",
      operator: "any of",
      values: ["Foo"],
      tablePrefix: "t",
    }).apply();
    expect(query).not.toContain("lower(");
    expect(query).toMatch(/^t\.name IN \(\{/);
  });
});
