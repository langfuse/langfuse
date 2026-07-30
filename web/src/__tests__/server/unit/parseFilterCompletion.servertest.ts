import { describe, expect, it } from "vitest";

import { parseGeneratedFilters } from "@/src/features/search-bar/server/parseFilterCompletion";

describe("parseGeneratedFilters", () => {
  it("parses a plain JSON array of v4 filters and derives query text", () => {
    const completion = JSON.stringify([
      {
        type: "stringOptions",
        column: "level",
        operator: "any of",
        value: ["ERROR"],
      },
      { type: "number", column: "latency", operator: ">", value: 2 },
    ]);
    const { filters, queryText, droppedCount } =
      parseGeneratedFilters(completion);
    expect(filters).toHaveLength(2);
    expect(droppedCount).toBe(0);
    expect(queryText).toContain("level");
    expect(queryText).toContain("latency");
  });

  it("tolerates a { filters: [...] } wrapper", () => {
    const completion = JSON.stringify({
      filters: [
        {
          type: "stringOptions",
          column: "environment",
          operator: "any of",
          value: ["production"],
        },
      ],
    });
    const { filters, droppedCount } = parseGeneratedFilters(completion);
    expect(filters).toHaveLength(1);
    expect(filters[0]?.column).toBe("environment");
    expect(droppedCount).toBe(0);
  });

  it("extracts the JSON array out of surrounding prose", () => {
    const completion = [
      "Here are the filters you asked for:",
      '[{"type":"number","column":"totalCost","operator":">","value":0.5}]',
      "Hope that helps!",
    ].join("\n");
    const { filters } = parseGeneratedFilters(completion);
    expect(filters).toHaveLength(1);
    expect(filters[0]?.column).toBe("totalCost");
  });

  it("drops hallucinated / non-v4 columns and keeps the representable ones", () => {
    const completion = JSON.stringify([
      // legacy trace columns the v4 grammar can't express:
      { type: "boolean", column: "bookmarked", operator: "=", value: true },
      {
        type: "datetime",
        column: "timestamp",
        operator: ">",
        value: "2026-06-01T00:00:00.000Z",
      },
      // a valid v4 filter:
      {
        type: "stringOptions",
        column: "level",
        operator: "any of",
        value: ["ERROR"],
      },
    ]);
    const { filters, droppedCount } = parseGeneratedFilters(completion);
    expect(filters).toHaveLength(1);
    expect(filters[0]?.column).toBe("level");
    expect(droppedCount).toBe(2);
  });

  it("keeps metadata and score filters (representable in the grammar)", () => {
    const completion = JSON.stringify([
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
        type: "booleanObject",
        column: "score_booleans",
        key: "flag",
        operator: "=",
        value: true,
      },
      {
        type: "booleanObject",
        column: "trace_score_booleans",
        key: "traceFlag",
        operator: "<>",
        value: false,
      },
    ]);
    const { filters, droppedCount } = parseGeneratedFilters(completion);
    expect(filters).toHaveLength(4);
    expect(droppedCount).toBe(0);
  });

  it("drops a filter whose type is incompatible with the column's contract", () => {
    // The model emitted a plain `number` filter on the score column (it needs
    // `numberObject` with a key) — events.all 500s on this. Drop it; keep the
    // valid sibling.
    const completion = JSON.stringify([
      { type: "number", column: "scores_avg", operator: ">", value: 90 },
      {
        type: "stringOptions",
        column: "level",
        operator: "any of",
        value: ["ERROR"],
      },
    ]);
    const { filters, droppedCount } = parseGeneratedFilters(completion);
    expect(filters).toHaveLength(1);
    expect(filters[0]?.column).toBe("level");
    expect(droppedCount).toBe(1);
  });

  it("keeps a structurally-valid filter when a sibling element is malformed", () => {
    // Weaker models drift on shape. Here element 2 has an operator that isn't in
    // the stringOptions enum ("equals" is not "any of"/"none of"), so it fails
    // `singleFilter`. The whole array must NOT be discarded — the valid
    // level:ERROR filter survives, and the malformed one counts as dropped.
    const completion = JSON.stringify([
      {
        type: "stringOptions",
        column: "level",
        operator: "any of",
        value: ["ERROR"],
      },
      {
        type: "stringOptions",
        column: "environment",
        operator: "equals",
        value: "production",
      },
    ]);
    const { filters, droppedCount } = parseGeneratedFilters(completion);
    expect(filters).toHaveLength(1);
    expect(filters[0]?.column).toBe("level");
    expect(droppedCount).toBe(1);
  });

  it("returns no filters for non-JSON / refusal output", () => {
    const { filters, queryText, droppedCount } = parseGeneratedFilters(
      "I'm sorry, I can't help with that.",
    );
    expect(filters).toHaveLength(0);
    expect(queryText).toBe("");
    expect(droppedCount).toBe(0);
  });

  it("returns no filters for an empty array", () => {
    const { filters, droppedCount } = parseGeneratedFilters("[]");
    expect(filters).toHaveLength(0);
    expect(droppedCount).toBe(0);
  });
});

describe("parseGeneratedFilters — score-name validation", () => {
  // The observed score names by column type, as the client threads them from
  // filterOptions. A field left undefined means "not loaded" → no enforcement
  // for that column.
  const scoreNames = {
    numeric: ["helpfulness-rating", "accuracy"],
    categorical: ["sentiment"],
    traceNumeric: ["overall-quality"],
    traceCategorical: ["Hallucination Check"],
  };

  const numericScoreFilter = (key: string) => ({
    type: "numberObject",
    column: "scores_avg",
    key,
    operator: ">",
    value: 0.8,
  });

  it("keeps an exactly-matching score name untouched", () => {
    const completion = JSON.stringify([numericScoreFilter("accuracy")]);
    const { filters, droppedCount, unknownScoreNames } = parseGeneratedFilters(
      completion,
      scoreNames,
    );
    expect(filters).toHaveLength(1);
    expect(filters[0]).toMatchObject({ key: "accuracy" });
    expect(droppedCount).toBe(0);
    expect(unknownScoreNames).toEqual([]);
  });

  it("corrects underscore notation to the real hyphenated score name", () => {
    // The motivating bug: the user wrote `helpfulness_rating`, the real score
    // is `helpfulness-rating`, and the dead filter silently returned zero rows.
    const completion = JSON.stringify([
      numericScoreFilter("helpfulness_rating"),
    ]);
    const { filters, queryText, droppedCount, unknownScoreNames } =
      parseGeneratedFilters(completion, scoreNames);
    expect(filters).toHaveLength(1);
    expect(filters[0]).toMatchObject({
      column: "scores_avg",
      key: "helpfulness-rating",
    });
    expect(queryText).toContain("helpfulness-rating");
    expect(droppedCount).toBe(0);
    expect(unknownScoreNames).toEqual([]);
  });

  it("corrects case/space/separator variants, preserving the column's level", () => {
    const completion = JSON.stringify([
      {
        type: "categoryOptions",
        column: "trace_score_categories",
        key: "hallucination_check",
        operator: "any of",
        value: ["faithful"],
      },
      {
        type: "numberObject",
        column: "trace_scores_avg",
        key: "Overall Quality",
        operator: "<",
        value: 0.5,
      },
    ]);
    const { filters, droppedCount } = parseGeneratedFilters(
      completion,
      scoreNames,
    );
    expect(filters).toHaveLength(2);
    expect(filters[0]).toMatchObject({
      column: "trace_score_categories",
      key: "Hallucination Check",
    });
    expect(filters[1]).toMatchObject({
      column: "trace_scores_avg",
      key: "overall-quality",
    });
    expect(droppedCount).toBe(0);
  });

  it("drops an unknown score name, reports it, and keeps valid siblings", () => {
    const completion = JSON.stringify([
      numericScoreFilter("nonexistent_score"),
      {
        type: "stringOptions",
        column: "level",
        operator: "any of",
        value: ["ERROR"],
      },
    ]);
    const { filters, droppedCount, unknownScoreNames } = parseGeneratedFilters(
      completion,
      scoreNames,
    );
    expect(filters).toHaveLength(1);
    expect(filters[0]?.column).toBe("level");
    expect(droppedCount).toBe(1);
    expect(unknownScoreNames).toEqual(["nonexistent_score"]);
  });

  it("does not rescue a name across score types (numeric stays numeric)", () => {
    // `sentiment` exists only as a categorical score; a numberObject filter on
    // it cannot be corrected in place (operator/value shapes differ), so it is
    // dropped and reported rather than silently retyped.
    const completion = JSON.stringify([numericScoreFilter("sentiment")]);
    const { filters, droppedCount, unknownScoreNames } = parseGeneratedFilters(
      completion,
      scoreNames,
    );
    expect(filters).toHaveLength(0);
    expect(droppedCount).toBe(1);
    expect(unknownScoreNames).toEqual(["sentiment"]);
  });

  it("drops when the normalized name is ambiguous between two real scores", () => {
    const completion = JSON.stringify([numericScoreFilter("My Score")]);
    const { filters, unknownScoreNames } = parseGeneratedFilters(completion, {
      ...scoreNames,
      numeric: ["my-score", "my_score"],
    });
    expect(filters).toHaveLength(0);
    expect(unknownScoreNames).toEqual(["My Score"]);
  });

  it("still keeps an exact match when its normalization is ambiguous", () => {
    const completion = JSON.stringify([numericScoreFilter("my_score")]);
    const { filters, unknownScoreNames } = parseGeneratedFilters(completion, {
      ...scoreNames,
      numeric: ["my-score", "my_score"],
    });
    expect(filters).toHaveLength(1);
    expect(filters[0]).toMatchObject({ key: "my_score" });
    expect(unknownScoreNames).toEqual([]);
  });

  it("skips enforcement for a column whose name set was not provided", () => {
    // Only the numeric sets are loaded; the categorical filter passes through
    // unvalidated (its filter-options column has not loaded on the client).
    const completion = JSON.stringify([
      {
        type: "categoryOptions",
        column: "score_categories",
        key: "anything_goes",
        operator: "any of",
        value: ["yes"],
      },
    ]);
    const { filters, unknownScoreNames } = parseGeneratedFilters(completion, {
      numeric: ["accuracy"],
    });
    expect(filters).toHaveLength(1);
    expect(filters[0]).toMatchObject({ key: "anything_goes" });
    expect(unknownScoreNames).toEqual([]);
  });

  it("skips enforcement entirely when no score-name context is passed", () => {
    const completion = JSON.stringify([numericScoreFilter("anything_goes")]);
    const { filters, unknownScoreNames } = parseGeneratedFilters(completion);
    expect(filters).toHaveLength(1);
    expect(filters[0]).toMatchObject({ key: "anything_goes" });
    expect(unknownScoreNames).toEqual([]);
  });

  it("drops every score filter when the loaded set is empty (project has none)", () => {
    const completion = JSON.stringify([numericScoreFilter("accuracy")]);
    const { filters, droppedCount, unknownScoreNames } = parseGeneratedFilters(
      completion,
      { ...scoreNames, numeric: [] },
    );
    expect(filters).toHaveLength(0);
    expect(droppedCount).toBe(1);
    expect(unknownScoreNames).toEqual(["accuracy"]);
  });

  it("dedupes repeated unknown names in the report", () => {
    const completion = JSON.stringify([
      numericScoreFilter("ghost_score"),
      { ...numericScoreFilter("ghost_score"), operator: "<", value: 0.2 },
    ]);
    const { unknownScoreNames } = parseGeneratedFilters(completion, scoreNames);
    expect(unknownScoreNames).toEqual(["ghost_score"]);
  });

  const booleanScoreFilter = (column: string, key: string) => ({
    type: "booleanObject",
    column,
    key,
    operator: "=",
    value: true,
  });

  it("corrects a separator variant of a boolean score name in place", () => {
    // Same dead-filter class as numeric/categorical: a boolean score addressed
    // by a misspelled name round-trips cleanly and matches nothing. The
    // observed set (`score_booleans`) lets us correct it.
    const completion = JSON.stringify([
      booleanScoreFilter("score_booleans", "is_flagged"),
    ]);
    const { filters, droppedCount, unknownScoreNames } = parseGeneratedFilters(
      completion,
      { ...scoreNames, booleans: ["is-flagged"] },
    );
    expect(filters).toHaveLength(1);
    expect(filters[0]).toMatchObject({
      column: "score_booleans",
      key: "is-flagged",
    });
    expect(droppedCount).toBe(0);
    expect(unknownScoreNames).toEqual([]);
  });

  it("drops an unknown trace-boolean score name and reports it", () => {
    const completion = JSON.stringify([
      booleanScoreFilter("trace_score_booleans", "ghost_flag"),
    ]);
    const { filters, droppedCount, unknownScoreNames } = parseGeneratedFilters(
      completion,
      { ...scoreNames, traceBooleans: ["is-reviewed"] },
    );
    expect(filters).toHaveLength(0);
    expect(droppedCount).toBe(1);
    expect(unknownScoreNames).toEqual(["ghost_flag"]);
  });

  it("passes a boolean score filter through when its set was not provided", () => {
    // No `booleans` set loaded → no enforcement for that column (a boolean
    // score filter must never be dropped just because the set is absent).
    const completion = JSON.stringify([
      booleanScoreFilter("score_booleans", "anything_goes"),
    ]);
    const { filters, unknownScoreNames } = parseGeneratedFilters(completion, {
      numeric: ["accuracy"],
    });
    expect(filters).toHaveLength(1);
    expect(filters[0]).toMatchObject({ key: "anything_goes" });
    expect(unknownScoreNames).toEqual([]);
  });
});

describe("parseGeneratedFilters — extraction robustness", () => {
  const levelFilter = (value: string) => ({
    type: "stringOptions",
    column: "level",
    operator: "any of",
    value: [value],
  });

  it("applies the model's self-corrected array, not the earlier draft", () => {
    // The model drafts an array, second-guesses itself in prose, then emits a
    // corrected array. A greedy first-`[`..last-`]` match spans BOTH arrays plus
    // the prose between them and fails to JSON.parse — losing a correct answer.
    // The parser must return the LAST (corrected) array.
    const completion = [
      "Here is a first attempt:",
      JSON.stringify([levelFilter("DEBUG")]),
      "On reflection you asked for errors, not debug logs. Corrected filters:",
      JSON.stringify([levelFilter("ERROR")]),
    ].join("\n");
    const { filters, droppedCount } = parseGeneratedFilters(completion);
    expect(filters).toHaveLength(1);
    expect(filters[0]).toMatchObject({ column: "level", value: ["ERROR"] });
    expect(droppedCount).toBe(0);
  });

  it("parses a single array embedded in prose unchanged", () => {
    const completion = [
      "Sure — here you go:",
      JSON.stringify([levelFilter("WARNING")]),
    ].join("\n");
    const { filters, droppedCount } = parseGeneratedFilters(completion);
    expect(filters).toHaveLength(1);
    expect(filters[0]).toMatchObject({ column: "level", value: ["WARNING"] });
    expect(droppedCount).toBe(0);
  });

  it("does not let a `]` inside a string value break balance tracking", () => {
    // The closing bracket lives inside a metadata value string; naive depth
    // tracking would close the array early and fail to parse.
    const completion = [
      "Filters:",
      JSON.stringify([
        {
          type: "stringObject",
          column: "metadata",
          key: "note",
          operator: "=",
          value: "arr]end",
        },
      ]),
      "Let me know if that works.",
    ].join("\n");
    const { filters, droppedCount } = parseGeneratedFilters(completion);
    expect(filters).toHaveLength(1);
    expect(filters[0]).toMatchObject({
      column: "metadata",
      key: "note",
      value: "arr]end",
    });
    expect(droppedCount).toBe(0);
  });

  it("returns the empty result when brackets appear but no array is valid JSON", () => {
    const completion =
      "Use the [level] and [environment] fields to build that filter.";
    const { filters, queryText, droppedCount } =
      parseGeneratedFilters(completion);
    expect(filters).toHaveLength(0);
    expect(queryText).toBe("");
    expect(droppedCount).toBe(0);
  });

  it("honors an explicit `[]` retraction over an earlier drafted filter", () => {
    // The prompt asks for `[]` when no filter applies. If the model drafts a
    // filter, reconsiders in prose, then emits `[]` as its FINAL answer, we must
    // honor the retraction — NOT apply the draft it explicitly walked back.
    const completion =
      "Attempt: " +
      JSON.stringify([
        {
          type: "stringOptions",
          column: "level",
          operator: "any of",
          value: ["ERROR"],
        },
      ]) +
      " Actually that cannot be expressed here. No filter applies: []";
    const { filters, droppedCount } = parseGeneratedFilters(completion);
    expect(filters).toHaveLength(0);
    expect(droppedCount).toBe(0);
  });

  it("reports the LARGEST all-malformed array's size when nothing validates", () => {
    // Reversed candidate iteration visits the trailing stray array first. When
    // NO candidate yields a valid filter, `droppedCount` must reflect the
    // largest array the model emitted (the one it most plausibly intended), not
    // whichever was visited first. Here a 4-element all-malformed filter array
    // precedes a stray 2-element prose list; the count must be 4, not 2.
    const malformed = (column: string) => ({
      type: "stringOptions",
      column,
      operator: "equals", // not a valid stringOptions operator → fails singleFilter
      value: "x",
    });
    const completion = [
      "My first attempt (four filters):",
      JSON.stringify([
        malformed("level"),
        malformed("environment"),
        malformed("name"),
        malformed("userId"),
      ]),
      "Actually, ignore those and just consider these two tags:",
      JSON.stringify(["a", "b"]),
    ].join("\n");
    const { filters, droppedCount } = parseGeneratedFilters(completion);
    expect(filters).toHaveLength(0);
    expect(droppedCount).toBe(4);
  });
});
