import { describe, expect, it } from "vitest";

import { clickhouseSearchCondition } from "./search";

describe("clickhouseSearchCondition", () => {
  it("keeps the token prefilter for English content search", () => {
    const { query } = clickhouseSearchCondition({
      query: "transfer",
      searchType: ["content"],
      tablePrefix: "e",
      searchColumns: ["span_id", "name", "trace_id"],
      useEventsTablePath: true,
    });

    expect(query).toContain(
      "e.input ILIKE {searchString: String} AND hasAllTokens(lower(e.input)",
    );
    expect(query).toContain(
      "e.output ILIKE {searchString: String} AND hasAllTokens(lower(e.output)",
    );
  });

  it("skips the token prefilter for Thai content search", () => {
    const { query, params } = clickhouseSearchCondition({
      query: "โอนเงิน",
      searchType: ["content"],
      tablePrefix: "e",
      searchColumns: ["span_id", "name", "trace_id"],
      useEventsTablePath: true,
    });

    expect(query).toContain("e.input ILIKE {searchString: String}");
    expect(query).toContain("e.output ILIKE {searchString: String}");
    expect(query).not.toContain(
      "e.input ILIKE {searchString: String} AND hasAllTokens(lower(e.input)",
    );
    expect(query).not.toContain(
      "e.output ILIKE {searchString: String} AND hasAllTokens(lower(e.output)",
    );
    expect(params).toHaveProperty("searchStringEscaped");
  });
});
