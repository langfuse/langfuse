import { describe, expect, it } from "vitest";

import { StringFilter, StringObjectFilter } from "./clickhouse-filter";

describe("FTS token prefilter fallback", () => {
  it("keeps the token prefilter for English `matches` filters", () => {
    const { query } = new StringFilter({
      clickhouseTable: "events_proto",
      field: "input",
      operator: "matches",
      value: "transfer",
      tablePrefix: "e",
    }).apply();

    expect(query).toContain("position(lower(e.input), lower(");
    expect(query).toContain("hasAllTokens(lower(e.input)");
  });

  it("skips the token prefilter for Thai `matches` filters", () => {
    const { query } = new StringFilter({
      clickhouseTable: "events_proto",
      field: "input",
      operator: "matches",
      value: "โอนเงิน",
      tablePrefix: "e",
    }).apply();

    expect(query).toContain("position(lower(e.input), lower(");
    expect(query).not.toContain("hasAllTokens(lower(e.input)");
  });

  it("skips the metadata token prefilter for Thai `matches` filters", () => {
    const { query } = new StringObjectFilter({
      clickhouseTable: "events_proto",
      field: "metadata",
      key: "message",
      operator: "matches",
      value: "โอนเงิน",
      tablePrefix: "e",
    }).apply();

    expect(query).toContain("position(e.metadata_values[");
    expect(query).not.toContain("hasAllTokens(");
  });
});
