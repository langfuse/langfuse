import { astToFilterState } from "@/src/features/search-bar/lib/adapter";
import { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";
import { parse } from "@/src/features/search-bar/lib/qlang";
import { validateQuery } from "@/src/features/search-bar/lib/validate";
import type { FilterState } from "@langfuse/shared";

function lower(text: string) {
  return astToFilterState(parse(text).ast);
}

describe("astToFilterState", () => {
  it("lowers a flat AND chain of facets plus free text", () => {
    const r = lower("timeout level:ERROR env:prod");
    expect(r.errors).toEqual([]);
    expect(r.searchQuery).toBe("timeout");
    expect(r.filters).toEqual([
      {
        type: "stringOptions",
        column: "level",
        operator: "any of",
        value: ["ERROR"],
      },
      {
        type: "stringOptions",
        column: "environment",
        operator: "any of",
        value: ["prod"],
      },
    ]);
  });

  it("lowers grouped values to any-of and negation to none-of", () => {
    expect(lower("level:(ERROR OR WARNING)").filters).toEqual([
      {
        type: "stringOptions",
        column: "level",
        operator: "any of",
        value: ["ERROR", "WARNING"],
      },
    ]);
    expect(lower("-env:(dev OR staging)").filters).toEqual([
      {
        type: "stringOptions",
        column: "environment",
        operator: "none of",
        value: ["dev", "staging"],
      },
    ]);
  });

  it("collapses top-level same-field OR chains into one any-of filter", () => {
    const r = lower("level:ERROR OR level:WARNING");
    expect(r.errors).toEqual([]);
    expect(r.filters).toEqual([
      {
        type: "stringOptions",
        column: "level",
        operator: "any of",
        value: ["ERROR", "WARNING"],
      },
    ]);
  });

  it("rejects cross-field OR", () => {
    const r = lower("level:ERROR OR env:dev");
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.filters).toEqual([]);
  });

  it("lowers comparisons and inverts them under negation", () => {
    expect(lower("latency:>2").filters).toEqual([
      { type: "number", column: "latency", operator: ">", value: 2 },
    ]);
    expect(lower("NOT latency:>2").filters).toEqual([
      { type: "number", column: "latency", operator: "<=", value: 2 },
    ]);
  });

  it("rejects negated numeric equality (would need an OR group)", () => {
    const r = lower("-latency:2");
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("lowers textSearch equality to contains; := to exact", () => {
    expect(lower("statusMessage:rate").filters).toEqual([
      {
        type: "string",
        column: "statusMessage",
        operator: "contains",
        value: "rate",
      },
    ]);
    expect(lower("statusMessage:=rate").filters).toEqual([
      { type: "string", column: "statusMessage", operator: "=", value: "rate" },
    ]);
    expect(lower("-statusMessage:~rate").filters).toEqual([
      {
        type: "string",
        column: "statusMessage",
        operator: "does not contain",
        value: "rate",
      },
    ]);
  });

  it("lowers explicit string operators", () => {
    expect(lower("input:^How").filters).toEqual([
      {
        type: "string",
        column: "input",
        operator: "starts with",
        value: "How",
      },
    ]);
    expect(lower("output:$done").filters).toEqual([
      {
        type: "string",
        column: "output",
        operator: "ends with",
        value: "done",
      },
    ]);
  });

  it("rejects the FTS * operator (full text goes through in: scopes)", () => {
    // The events tRPC filter contract has no `matches` operator — full-text
    // search is searchQuery/searchType, i.e. free text + in: scopes.
    expect(lower('input:*"refund policy"').errors.length).toBeGreaterThan(0);
    expect(lower("metadata.region:*eu").errors.length).toBeGreaterThan(0);
  });

  it("lowers array fields with any-of, none-of, and all-of", () => {
    expect(lower("tags:(a OR b)").filters).toEqual([
      {
        type: "arrayOptions",
        column: "traceTags",
        operator: "any of",
        value: ["a", "b"],
      },
    ]);
    expect(lower("-tags:a").filters).toEqual([
      {
        type: "arrayOptions",
        column: "traceTags",
        operator: "none of",
        value: ["a"],
      },
    ]);
    expect(lower("tags:(a AND b)").filters).toEqual([
      {
        type: "arrayOptions",
        column: "traceTags",
        operator: "all of",
        value: ["a", "b"],
      },
    ]);
  });

  it("lowers datetime comparisons to Date values", () => {
    const r = lower("startTime:>2026-06-01");
    expect(r.errors).toEqual([]);
    expect(r.filters).toHaveLength(1);
    const f = r.filters[0]!;
    expect(f.type).toBe("datetime");
    expect(f.operator).toBe(">");
    expect((f as { value: Date }).value instanceof Date).toBe(true);
  });

  it("lowers booleans and inverts the value under negation", () => {
    expect(lower("isRootObservation:true").filters).toEqual([
      {
        type: "boolean",
        column: "isRootObservation",
        operator: "=",
        value: true,
      },
    ]);
    expect(lower("-isRootObservation:true").filters).toEqual([
      {
        type: "boolean",
        column: "isRootObservation",
        operator: "=",
        value: false,
      },
    ]);
  });

  it("lowers metadata paths to stringObject filters", () => {
    expect(lower("metadata.region:eu").filters).toEqual([
      {
        type: "stringObject",
        column: "metadata",
        key: "region",
        operator: "=",
        value: "eu",
      },
    ]);
    expect(lower("-metadata.region:~eu").filters).toEqual([
      {
        type: "stringObject",
        column: "metadata",
        key: "region",
        operator: "does not contain",
        value: "eu",
      },
    ]);
    expect(lower("metadata.region:>5").errors.length).toBeGreaterThan(0);
    expect(lower("-metadata.region:eu").errors.length).toBeGreaterThan(0);
  });

  it("lowers score paths to numeric or categorical columns", () => {
    expect(lower("scores.accuracy:>0.8").filters).toEqual([
      {
        type: "numberObject",
        column: "scores_avg",
        key: "accuracy",
        operator: ">",
        value: 0.8,
      },
    ]);
    expect(lower("scores.accuracy:0.5").filters).toEqual([
      {
        type: "numberObject",
        column: "scores_avg",
        key: "accuracy",
        operator: "=",
        value: 0.5,
      },
    ]);
    expect(lower("scores.feedback:positive").filters).toEqual([
      {
        type: "categoryOptions",
        column: "score_categories",
        key: "feedback",
        operator: "any of",
        value: ["positive"],
      },
    ]);
    expect(lower("-traceScores.feedback:(bad OR worse)").filters).toEqual([
      {
        type: "categoryOptions",
        column: "trace_score_categories",
        key: "feedback",
        operator: "none of",
        value: ["bad", "worse"],
      },
    ]);
  });

  it("lowers has:/-has: to null filters", () => {
    expect(lower("has:endTime").filters).toEqual([
      { type: "null", column: "endTime", operator: "is not null", value: "" },
    ]);
    expect(lower("-has:userId").filters).toEqual([
      { type: "null", column: "userId", operator: "is null", value: "" },
    ]);
    expect(lower("has:(endTime OR userId)").errors.length).toBeGreaterThan(0);
  });

  it("collects in: scopes into searchType", () => {
    const r = lower("in:content in:input refund policy");
    expect(r.errors).toEqual([]);
    expect(r.searchType).toEqual(["content", "input"]);
    expect(r.searchQuery).toBe("refund policy");
  });

  it("flattens parenthesized AND groups like the top-level chain", () => {
    const r = lower("(env:dev timeout)");
    expect(r.errors).toEqual([]);
    expect(r.searchQuery).toBe("timeout");
    expect(r.filters).toHaveLength(1);
  });

  it("errors instead of silently dropping unrepresentable nodes", () => {
    const cases = [
      "NOT (level:ERROR env:dev)",
      "level:ERROR OR env:dev",
      "latency:(1 OR 2)",
      "metadata.a:(x OR y)",
      "-tags:(a AND b)",
    ];
    for (const text of cases) {
      const r = lower(text);
      expect(r.errors.length, `expected errors: ${text}`).toBeGreaterThan(0);
    }
  });
});

describe("validateQuery / adapter parity", () => {
  it("everything validateQuery accepts lowers without errors", () => {
    const queries = [
      "",
      "level:ERROR env:prod timeout",
      "level:(ERROR OR WARNING)",
      "-env:dev latency:>2",
      "scores.accuracy:>0.8 traceScores.nps:positive",
      "metadata.region:~eu has:endTime -has:userId",
      "in:content refund tags:(a AND b)",
      "isRootObservation:true name:~chat",
      "(level:ERROR OR level:WARNING) env:dev",
    ];
    for (const text of queries) {
      const v = validateQuery(text);
      expect(v.valid, `expected valid: ${text}`).toBe(true);
      const r = astToFilterState(v.ast);
      expect(r.errors, `expected lowering: ${text}`).toEqual([]);
    }
  });
});

describe("filterStateToQueryText", () => {
  it("round-trips legacy filter state through the grammar", () => {
    const filters: FilterState = [
      {
        type: "stringOptions",
        column: "type",
        operator: "any of",
        value: ["GENERATION", "AGENT"],
      },
      {
        type: "stringOptions",
        column: "environment",
        operator: "none of",
        value: ["dev"],
      },
      { type: "number", column: "latency", operator: ">", value: 2 },
      {
        type: "string",
        column: "statusMessage",
        operator: "contains",
        value: "rate limit",
      },
      {
        type: "boolean",
        column: "isRootObservation",
        operator: "=",
        value: true,
      },
      {
        type: "stringObject",
        column: "metadata",
        key: "region",
        operator: "=",
        value: "eu",
      },
      {
        type: "numberObject",
        column: "scores_avg",
        key: "accuracy",
        operator: ">",
        value: 0.8,
      },
      {
        type: "categoryOptions",
        column: "score_categories",
        key: "feedback",
        operator: "any of",
        value: ["positive"],
      },
      {
        type: "arrayOptions",
        column: "traceTags",
        operator: "all of",
        value: ["a", "b"],
      },
      { type: "null", column: "endTime", operator: "is not null", value: "" },
    ];

    const { text, skipped } = filterStateToQueryText(filters);
    expect(skipped).toEqual([]);

    const v = validateQuery(text);
    expect(v.valid, text).toBe(true);
    const r = astToFilterState(v.ast);
    expect(r.errors).toEqual([]);
    expect(r.filters).toEqual(filters);
  });

  it("maps display-name columns and boolean <> normalization", () => {
    const filters: FilterState = [
      { type: "string", column: "User ID", operator: "=", value: "u1" },
      {
        type: "boolean",
        column: "hasParentObservation",
        operator: "<>",
        value: true,
      },
    ];
    const { text, skipped } = filterStateToQueryText(filters);
    expect(skipped).toEqual([]);
    const r = astToFilterState(validateQuery(text).ast);
    expect(r.errors).toEqual([]);
    expect(r.filters).toEqual([
      {
        type: "stringOptions",
        column: "userId",
        operator: "any of",
        value: ["u1"],
      },
      {
        type: "boolean",
        column: "hasParentObservation",
        operator: "=",
        value: false,
      },
    ]);
  });

  it("reports unrepresentable filters in skipped (descriptions + objects)", () => {
    const positionFilter: FilterState[number] = {
      type: "positionInTrace",
      column: "positionInTrace",
      operator: "=",
      key: "root",
    };
    const { text, skipped, skippedFilters } = filterStateToQueryText([
      positionFilter,
    ]);
    expect(text).toBe("");
    expect(skipped).toHaveLength(1);
    // The actual objects are surfaced so the container can preserve them
    // across a commit (no silent drop).
    expect(skippedFilters).toEqual([positionFilter]);
  });

  it("round-trips bare boolean keywords and leading-hyphen free text", () => {
    // serialize() must quote AND/OR/NOT and -foo so they reparse as free text
    // rather than as operators/negation (otherwise the bar lands invalid).
    for (const searchQuery of ["OR", "AND", "NOT", "-foo", "OR AND -x"]) {
      const { text } = filterStateToQueryText([], { searchQuery });
      const v = validateQuery(text);
      expect(v.valid, `${searchQuery} -> ${text}`).toBe(true);
      const r = astToFilterState(v.ast);
      expect(r.errors).toEqual([]);
      expect(r.searchQuery).toBe(searchQuery);
    }
  });

  it("encodes free text and non-default search scopes; round-trips them", () => {
    const filters: FilterState = [
      {
        type: "stringOptions",
        column: "level",
        operator: "any of",
        value: ["ERROR"],
      },
    ];
    const { text } = filterStateToQueryText(filters, {
      searchQuery: "refund policy",
      searchType: ["content"],
    });
    const r = astToFilterState(validateQuery(text).ast);
    expect(r.errors).toEqual([]);
    expect(r.filters).toEqual(filters);
    expect(r.searchQuery).toBe("refund policy");
    expect(r.searchType).toEqual(["content"]);
  });

  it("omits an in: token for the default (id) search scope", () => {
    const { text } = filterStateToQueryText([], {
      searchQuery: "hello",
      searchType: ["id"],
    });
    expect(text).toBe("hello");
    const r = astToFilterState(validateQuery(text).ast);
    expect(r.searchType).toBeNull();
    expect(r.searchQuery).toBe("hello");
  });

  it("round-trips option values with operator-prefix, keyword, and empty forms", () => {
    const filters: FilterState = [
      {
        type: "stringOptions",
        column: "name",
        operator: "any of",
        value: [">weird", "OR", "", "normal"],
      },
    ];
    const { text, skipped } = filterStateToQueryText(filters);
    expect(skipped).toEqual([]);
    const v = validateQuery(text);
    expect(v.valid, text).toBe(true);
    expect(astToFilterState(v.ast).filters).toEqual(filters);
  });

  it("quotes free-text terms that carry grammar characters", () => {
    const { text } = filterStateToQueryText([], {
      searchQuery: "a:b (c)",
    });
    const v = validateQuery(text);
    expect(v.valid, text).toBe(true);
    const r = astToFilterState(v.ast);
    expect(r.filters).toEqual([]);
    expect(r.searchQuery).toBe("a:b (c)");
  });
});
