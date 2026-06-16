import { astToFilterState } from "@/src/features/search-bar/lib/adapter";
import { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";
import { parse } from "@/src/features/search-bar/lib/langQ";
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
    expect(lower("-statusMessage:*rate*").filters).toEqual([
      {
        type: "string",
        column: "statusMessage",
        operator: "does not contain",
        value: "rate",
      },
    ]);
  });

  it("lowers positional `*` globs to string match operators", () => {
    expect(lower("input:How*").filters).toEqual([
      {
        type: "string",
        column: "input",
        operator: "starts with",
        value: "How",
      },
    ]);
    expect(lower("output:*done").filters).toEqual([
      {
        type: "string",
        column: "output",
        operator: "ends with",
        value: "done",
      },
    ]);
    expect(lower('input:*"refund policy"*').filters).toEqual([
      {
        type: "string",
        column: "input",
        operator: "contains",
        value: "refund policy",
      },
    ]);
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
    expect(lower("-metadata.region:*eu*").filters).toEqual([
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

  it("routes numeric-looking values by observed score TYPE, not value syntax", () => {
    // `rating` is a categorical score whose labels happen to be numeric (1-5).
    // Without the score-type map the value-syntax heuristic wrongly picks the
    // numeric column; with it, the categorical column is targeted.
    const scoreTypes = {
      numericScoreNames: new Set<string>(["accuracy"]),
      categoricalScoreNames: new Set<string>(["rating"]),
      traceNumericScoreNames: new Set<string>(),
      traceCategoricalScoreNames: new Set<string>(["nps"]),
    };
    const lowerWith = (text: string) =>
      astToFilterState(parse(text).ast, scoreTypes);

    expect(lowerWith("scores.rating:5").filters).toEqual([
      {
        type: "categoryOptions",
        column: "score_categories",
        key: "rating",
        operator: "any of",
        value: ["5"],
      },
    ]);
    // A known-numeric score still lowers numeric.
    expect(lowerWith("scores.accuracy:0.5").filters).toEqual([
      {
        type: "numberObject",
        column: "scores_avg",
        key: "accuracy",
        operator: "=",
        value: 0.5,
      },
    ]);
    // Trace-level categorical with a numeric label.
    expect(lowerWith("traceScores.nps:9").filters).toEqual([
      {
        type: "categoryOptions",
        column: "trace_score_categories",
        key: "nps",
        operator: "any of",
        value: ["9"],
      },
    ]);
    // Unknown score (not observed) falls back to the value-syntax heuristic.
    expect(lowerWith("scores.unseen:5").filters).toEqual([
      {
        type: "numberObject",
        column: "scores_avg",
        key: "unseen",
        operator: "=",
        value: 5,
      },
    ]);
  });

  it("treats := (exact) on a categorical score as a category match", () => {
    // `:=positive` must behave like the bare `:positive` (any-of category),
    // not be rejected as a comparison.
    const scoreTypes = {
      numericScoreNames: new Set<string>(),
      categoricalScoreNames: new Set<string>(["feedback"]),
      traceNumericScoreNames: new Set<string>(),
      traceCategoricalScoreNames: new Set<string>(),
    };
    const r = astToFilterState(
      parse("scores.feedback:=positive").ast,
      scoreTypes,
    );
    expect(r.errors).toEqual([]);
    expect(r.filters).toEqual([
      {
        type: "categoryOptions",
        column: "score_categories",
        key: "feedback",
        operator: "any of",
        value: ["positive"],
      },
    ]);
  });

  it("rejects a comparison operator on a categorical score", () => {
    // `feedback` is categorical → `scores.feedback:>0.8` would otherwise route
    // to the numeric column (no data) and return an empty table with no error.
    const scoreTypes = {
      numericScoreNames: new Set<string>(),
      categoricalScoreNames: new Set<string>(["feedback"]),
      traceNumericScoreNames: new Set<string>(),
      traceCategoricalScoreNames: new Set<string>(),
    };
    const r = astToFilterState(parse("scores.feedback:>0.8").ast, scoreTypes);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("rejects empty/whitespace numeric values instead of coercing to 0", () => {
    // Number("") and Number(" ") are both 0 (finite), so without an explicit
    // guard `latency:""` would silently filter for latency = 0.
    expect(lower('latency:""').errors.length).toBeGreaterThan(0);
    expect(lower('latency:" "').errors.length).toBeGreaterThan(0);
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

  it("lowers content: to the content search scope + query", () => {
    const r = lower('content:"refund policy"');
    expect(r.errors).toEqual([]);
    expect(r.searchType).toEqual(["content"]);
    expect(r.searchQuery).toBe("refund policy");
  });

  it("rejects multi-value content: instead of joining it into a phrase", () => {
    // content:(a OR b) / content:a,b can't mean OR — joining would search the
    // literal phrase "a b". Reject rather than silently rewrite the boolean.
    expect(lower("content:(refund OR cancel)").errors.length).toBeGreaterThan(
      0,
    );
    expect(lower("content:refund,cancel").errors.length).toBeGreaterThan(0);
  });

  it("routes a same-field content: OR through the canonical single-phrase error", () => {
    // `content:a OR content:b` collapses to a multi-value content node; it must
    // hit lowerContent's single-phrase error — NOT the old pseudo-branch message
    // that referenced the removed `in:` token.
    const r = lower("content:refund OR content:cancel");
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors.join(" ")).toContain("single-phrase");
    expect(r.errors.join(" ")).not.toContain("in:");
  });

  it("rejects content: sharing the query with bare free text", () => {
    // content: is one global-scope phrase; a bare sibling (or a second
    // content:) would silently fuse into one phrase under the content scope.
    expect(lower("content:refund kitten").errors.length).toBeGreaterThan(0);
    expect(lower("kitten content:refund").errors.length).toBeGreaterThan(0);
    expect(lower("content:a content:b").errors.length).toBeGreaterThan(0);
    // Alone, or with field filters, is fine.
    expect(lower("content:refund").errors).toEqual([]);
    expect(lower("content:refund level:ERROR").errors).toEqual([]);
    // Parens must not defeat the guard — nested AND free text flattens too.
    expect(
      lower("content:refund (kitten other)").errors.length,
    ).toBeGreaterThan(0);
  });

  it("lowers input:/output: to real column filters (not searchType)", () => {
    const r = lower("input:refund");
    expect(r.errors).toEqual([]);
    expect(r.searchType).toBeNull();
    expect(r.filters).toEqual([
      {
        type: "string",
        column: "input",
        operator: "contains",
        value: "refund",
      },
    ]);
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
      "metadata.region:*eu* has:endTime -has:userId",
      "content:refund tags:(a AND b)",
      "isRootObservation:true name:*chat*",
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

  it("skips a single-value array all-of instead of flipping it to any-of", () => {
    // `all of [a]` has no distinct grammar form (it equals any-of, and `(a)`
    // reparses as any-of). Preserve it via skippedFilters rather than silently
    // rewrite the operator shape on commit.
    const allOfOne: FilterState[number] = {
      type: "arrayOptions",
      column: "traceTags",
      operator: "all of",
      value: ["a"],
    };
    const r = filterStateToQueryText([allOfOne]);
    expect(r.text).toBe("");
    expect(r.skippedFilters).toEqual([allOfOne]);
    // Multi-value all-of still round-trips faithfully through the AND group.
    const multi: FilterState[number] = { ...allOfOne, value: ["a", "b"] };
    const back = astToFilterState(
      parse(filterStateToQueryText([multi]).text).ast,
    );
    expect(back.filters).toEqual([multi]);
  });

  it("skips keyed filters whose key carries grammar chars (would mis-parse)", () => {
    // `metadata.foo:bar` would reparse as key `metadata.foo` value `bar:…` and
    // silently corrupt the filter — so a key with a colon (or any NEEDS_QUOTES
    // char) must be preserved via skippedFilters, not serialized into text.
    const colonKeyMeta: FilterState[number] = {
      type: "stringObject",
      column: "metadata",
      key: "foo:bar",
      operator: "contains",
      value: "x",
    };
    const colonKeyScore: FilterState[number] = {
      type: "categoryOptions",
      column: "score_categories",
      key: "rate:test",
      operator: "any of",
      value: ["5"],
    };
    const r = filterStateToQueryText([colonKeyMeta, colonKeyScore]);
    expect(r.text).toBe("");
    expect(r.skippedFilters).toEqual([colonKeyMeta, colonKeyScore]);
    // A normal key still serializes into the query text (contains → `*x*`).
    expect(
      filterStateToQueryText([{ ...colonKeyMeta, key: "region" }]).text,
    ).toBe("metadata.region:*x*");
  });

  it("serializes metadata equality as the bare form, not :=value", () => {
    // `metadata.region:eu` lowers to a stringObject `=` filter; serializing it
    // back must produce the bare `metadata.region:eu` the user typed — the
    // explicit `metadata.region:=eu` would visibly rewrite the pill. Mirrors the
    // plain `string` exact carve-out.
    const eq: FilterState[number] = {
      type: "stringObject",
      column: "metadata",
      key: "region",
      operator: "=",
      value: "eu",
    };
    expect(filterStateToQueryText([eq]).text).toBe("metadata.region:eu");
  });

  it("round-trips bare boolean keywords and leading-hyphen free text", () => {
    // serialize() must quote AND/OR/NOT (any case), !-prefix tokens, and -foo
    // so they reparse as free text rather than as operators/negation/reserved
    // tokens (otherwise the bar lands invalid on page load from URL state).
    for (const searchQuery of [
      "OR",
      "AND",
      "NOT",
      "-foo",
      "OR AND -x",
      "or",
      "and",
      "not",
      "team or kitten",
      "test not really",
      "!important",
      "!critical bug",
    ]) {
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

  it("preserves a multi-space free-text phrase (no \\s+ collapse)", () => {
    const { text } = filterStateToQueryText([], {
      searchQuery: "hello   world",
    });
    const r = astToFilterState(validateQuery(text).ast);
    expect(r.searchQuery).toBe("hello   world");
  });

  it("renders a default multi-word phrase as ONE quoted token, not split terms", () => {
    // A default-scope searchQuery is a contiguous-substring phrase (ILIKE
    // %query%), so it derives to a single quoted token — consistent with the
    // scope-rewrite suggestions and preserving the user's quotes — rather than
    // whitespace-split bare terms that read as independent AND filters.
    expect(
      filterStateToQueryText([], { searchQuery: "abc abc abc" }).text,
    ).toBe('"abc abc abc"');
    // A single word needs no quotes.
    expect(filterStateToQueryText([], { searchQuery: "abc" }).text).toBe("abc");
    // Still round-trips to the same phrase.
    const r = astToFilterState(
      validateQuery(
        filterStateToQueryText([], { searchQuery: "abc abc abc" }).text,
      ).ast,
    );
    expect(r.searchQuery).toBe("abc abc abc");
  });

  it('round-trips an empty-value metadata filter (:="")', () => {
    const filters: FilterState = [
      {
        type: "stringObject",
        column: "metadata",
        key: "region",
        operator: "=",
        value: "",
      },
    ];
    const { text, skipped } = filterStateToQueryText(filters);
    expect(skipped).toEqual([]);
    const v = validateQuery(text);
    expect(v.valid, text).toBe(true);
    expect(astToFilterState(v.ast).filters).toEqual(filters);
  });
});
