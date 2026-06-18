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

  it("lowers bare free text to searchQuery with the default scope", () => {
    // The bar emits no scope token; searchType is null and the caller applies
    // the default (ids+names+input+output). Multiple bare words are one phrase.
    const r = lower("refund policy");
    expect(r.errors).toEqual([]);
    expect(r.searchType).toBeNull();
    expect(r.searchQuery).toBe("refund policy");
    expect(r.filters).toEqual([]);
  });

  it("lowers id:/name: to contains string filters (not exact any-of)", () => {
    // id/name are textSearch now: bare `key:value` is a substring search.
    for (const column of ["id", "name"]) {
      const r = lower(`${column}:chat`);
      expect(r.errors).toEqual([]);
      expect(r.filters).toEqual([
        { type: "string", column, operator: "contains", value: "chat" },
      ]);
    }
    // `key:=value` is the explicit exact match.
    expect(lower("name:=checkout").filters).toEqual([
      { type: "string", column: "name", operator: "=", value: "checkout" },
    ]);
    // Negation is does-not-contain (flat-representable).
    expect(lower("-id:abc").filters).toEqual([
      {
        type: "string",
        column: "id",
        operator: "does not contain",
        value: "abc",
      },
    ]);
  });

  it("lowers negated exact on id/name to stringOptions none-of (exact inequality)", () => {
    // `-name:=abc` is exact-inequality — the faithful flat form is
    // stringOptions none-of (there is no `string !=`). It is the inverse of the
    // positive `name:=abc` (`string =`) and the shape the facet emits when one
    // value is unchecked, so it must lower cleanly rather than error.
    for (const column of ["id", "name"]) {
      const r = lower(`-${column}:=abc`);
      expect(r.errors).toEqual([]);
      expect(r.filters).toEqual([
        { type: "stringOptions", column, operator: "none of", value: ["abc"] },
      ]);
    }
    // The commit gate accepts it (no longer a "not representable" error).
    expect(validateQuery("-name:=abc").valid).toBe(true);
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

  it("lowers quoted dot-path keys (score/metadata names with spaces)", () => {
    // A score or metadata name containing spaces is addressed with a quoted
    // segment after the prefix: `scores."Rouge Score"`. The quotes are stripped
    // to the real key in the lowered FilterState.
    expect(lower('scores."Rouge Score":>=1').filters).toEqual([
      {
        type: "numberObject",
        column: "scores_avg",
        key: "Rouge Score",
        operator: ">=",
        value: 1,
      },
    ]);
    expect(lower('traceScores."Hallucination Check":faithful').filters).toEqual(
      [
        {
          type: "categoryOptions",
          column: "trace_score_categories",
          key: "Hallucination Check",
          operator: "any of",
          value: ["faithful"],
        },
      ],
    );
    expect(lower('metadata."my key":eu').filters).toEqual([
      {
        type: "stringObject",
        column: "metadata",
        key: "my key",
        operator: "=",
        value: "eu",
      },
    ]);
    expect(validateQuery('scores."Rouge Score":>=1').valid).toBe(true);
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
      "input:refund tags:(a AND b)",
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

  it("renders keyed filters whose key carries grammar chars via a quoted segment", () => {
    // A metadata/score key with spaces, colons, or other grammar chars is now
    // addressable with a quoted segment after the prefix (`metadata."foo:bar"`,
    // `scores."rate test"`); it round-trips instead of being skipped.
    const colonKeyMeta: FilterState[number] = {
      type: "stringObject",
      column: "metadata",
      key: "foo:bar",
      operator: "contains",
      value: "x",
    };
    const spacedScore: FilterState[number] = {
      type: "categoryOptions",
      column: "score_categories",
      key: "rate test",
      operator: "any of",
      value: ["high"],
    };
    const r = filterStateToQueryText([colonKeyMeta, spacedScore]);
    expect(r.skippedFilters).toEqual([]);
    expect(r.text).toBe('metadata."foo:bar":*x* scores."rate test":high');
    // Both round-trip back to the same FilterState.
    expect(astToFilterState(validateQuery(r.text).ast).filters).toEqual([
      colonKeyMeta,
      spacedScore,
    ]);
    // A normal key still serializes bare (contains → `*x*`).
    expect(
      filterStateToQueryText([{ ...colonKeyMeta, key: "region" }]).text,
    ).toBe("metadata.region:*x*");
  });

  it("round-trips score names with spaces (numeric + categorical, no skip)", () => {
    const numeric: FilterState = [
      {
        type: "numberObject",
        column: "scores_avg",
        key: "Rouge Score",
        operator: ">=",
        value: 1,
      },
    ];
    const numericResult = filterStateToQueryText(numeric);
    expect(numericResult.skipped).toEqual([]);
    expect(numericResult.text).toBe('scores."Rouge Score":>=1');
    expect(
      astToFilterState(validateQuery(numericResult.text).ast).filters,
    ).toEqual(numeric);

    const categorical: FilterState = [
      {
        type: "categoryOptions",
        column: "trace_score_categories",
        key: "Hallucination Check",
        operator: "any of",
        value: ["faithful"],
      },
    ];
    const catResult = filterStateToQueryText(categorical);
    expect(catResult.skipped).toEqual([]);
    expect(catResult.text).toBe('traceScores."Hallucination Check":faithful');
    expect(astToFilterState(validateQuery(catResult.text).ast).filters).toEqual(
      categorical,
    );
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

  it("serializes a textSearch contains as the bare form, not *value*", () => {
    // `input:refund` lowers to a string `contains` filter; serializing it back
    // must stay bare (`input:refund`), the documented contains-default — the
    // `input:*refund*` glob form would visibly rewrite the user's text on every
    // commit echo. Symmetric inverse of the metadata-equality carve-out.
    const contains: FilterState[number] = {
      type: "string",
      column: "input",
      operator: "contains",
      value: "refund",
    };
    expect(filterStateToQueryText([contains]).text).toBe("input:refund");
    // starts/ends-with stay as globs (no bare form expresses them).
    expect(
      filterStateToQueryText([{ ...contains, operator: "starts with" }]).text,
    ).toBe("input:refund*");
    // The NEGATED form must stay bare too (`-input:refund`, not `-input:*refund*`).
    expect(
      filterStateToQueryText([{ ...contains, operator: "does not contain" }])
        .text,
    ).toBe("-input:refund");
  });

  it("rejects content: as an unknown field (the pseudo-field was removed)", () => {
    // `content:` is no longer a field, so a value form errors as "Unknown field".
    const r = lower('content:"refund"');
    expect(r.errors).toEqual(['Unknown field "content"']);
    expect(r.searchQuery).toBeNull();
    expect(r.searchType).toBeNull();
    // Bare `content:` (no value) is left to the parser — the adapter stays silent
    // (empty-value FilterNode returns before resolveField), so no double.
    expect(lower("content:").errors).toEqual([]);
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

  it("normalizes a residual input scope to an input: column filter", () => {
    // A residual input/output searchType (legacy URL or the legacy toolbar)
    // renders as the scoped token, which reparses to a real column filter — the
    // deliberate canonicalization (searchType → column filter on next commit).
    const { text } = filterStateToQueryText([], {
      searchQuery: "refund policy",
      searchType: ["input"],
    });
    const r = astToFilterState(validateQuery(text).ast);
    expect(r.errors).toEqual([]);
    expect(r.filters).toEqual([
      {
        type: "string",
        column: "input",
        operator: "contains",
        value: "refund policy",
      },
    ]);
    expect(r.searchQuery).toBeNull();
    expect(r.searchType).toBeNull();
  });

  it("renders the default scope (ids+names+input+output) as bare free text", () => {
    // Any subset of {id, content} is the default scope — no scope token, so it
    // round-trips to bare free text (and the caller re-applies the default).
    for (const searchType of [
      ["id"],
      ["id", "content"],
      ["content"],
    ] as const) {
      const { text } = filterStateToQueryText([], {
        searchQuery: "hello",
        searchType: [...searchType],
      });
      expect(text, `${searchType}`).toBe("hello");
      const r = astToFilterState(validateQuery(text).ast);
      expect(r.searchType).toBeNull();
      expect(r.searchQuery).toBe("hello");
    }
  });

  it("preserves EXACT semantics for a single-value stringOptions any-of on id/name", () => {
    // id/name are stringOptions columns in eventsTable (the facet sidebar emits
    // this shape), but textSearch fields in the bar. A single-value any-of must
    // NOT silently re-lower to `contains` — it must keep exact-match semantics.
    for (const column of ["id", "name"]) {
      const filters: FilterState = [
        { type: "stringOptions", column, operator: "any of", value: ["abc"] },
      ];
      const { text, skipped } = filterStateToQueryText(filters);
      expect(skipped).toEqual([]);
      expect(text).toBe(`${column}:=abc`); // explicit exact, not bare `id:abc`
      const r = astToFilterState(validateQuery(text).ast);
      // Stabilizes to {string,=} — same semantics (exact equality), never contains.
      expect(r.filters).toEqual([
        { type: "string", column, operator: "=", value: "abc" },
      ]);
      // And the stabilized form is a fixpoint (no further drift).
      const echo = filterStateToQueryText(r.filters);
      expect(echo.text).toBe(`${column}:=abc`);
    }
  });

  it("round-trips a multi-value stringOptions any-of on id/name losslessly", () => {
    const filters: FilterState = [
      {
        type: "stringOptions",
        column: "id",
        operator: "any of",
        value: ["a", "b"],
      },
    ];
    const { text, skipped } = filterStateToQueryText(filters);
    expect(skipped).toEqual([]);
    expect(astToFilterState(validateQuery(text).ast).filters).toEqual(filters);
  });

  it("renders a single-value stringOptions none-of on id/name as negated exact", () => {
    // A single none-of on a textSearch field is exact-inequality. The faithful
    // grammar form is the negated exact `-name:=abc` (which lowers back to
    // stringOptions none-of), NOT `-name:abc` (does-not-contain / substring).
    // This is the facet "uncheck one value" shape — it must render in the bar,
    // not vanish into skippedFilters.
    for (const column of ["id", "name"]) {
      const filters: FilterState = [
        {
          type: "stringOptions",
          column,
          operator: "none of",
          value: ["abc"],
        },
      ];
      const { text, skipped, skippedFilters } = filterStateToQueryText(filters);
      expect(skipped).toEqual([]);
      expect(skippedFilters).toEqual([]);
      expect(text).toBe(`-${column}:=abc`);
      // And it round-trips back to the same stringOptions none-of filter.
      expect(astToFilterState(validateQuery(text).ast).filters).toEqual(
        filters,
      );
    }
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
