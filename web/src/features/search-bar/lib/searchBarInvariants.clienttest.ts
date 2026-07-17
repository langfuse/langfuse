import { describe, expect, it } from "vitest";

import { FIELDS } from "./fields";
import {
  generateQueryCases,
  runSearchBarInvariants,
  type RegistryUnderTest,
} from "./searchBarInvariants";

// Per-view wiring of the property harness. A second filterable view adopts the
// bar by adding its own block here with its registry — the harness is unchanged.
// See README.md "Extending to other views (the universality contract)".
const eventsView: RegistryUnderTest = {
  name: "events v4",
  fields: FIELDS,
  // Grammar overlay: dot-path examples + pseudo-fields (README step 2).
  extraKeys: [
    "metadata.region",
    "scores.accuracy",
    "traceScores.nps",
    // Quoted dot-path segments: score/metadata names with spaces + grammar
    // chars must round-trip through the quoting just like bare keys.
    'scores."Rouge Score"',
    'traceScores."Hallucination Check"',
    'metadata."my key"',
    "has:endTime",
    "has:latency",
  ],
  // Numeric vs categorical routing for scores.accuracy must not change which
  // invariants hold — only how a score lowers.
  scoreContexts: [
    {
      numericScoreNames: new Set(["accuracy"]),
      categoricalScoreNames: new Set(),
      traceNumericScoreNames: new Set(),
      traceCategoricalScoreNames: new Set(["nps"]),
    },
    {
      numericScoreNames: new Set(),
      categoricalScoreNames: new Set(["accuracy"]),
      traceNumericScoreNames: new Set(["nps"]),
      traceCategoricalScoreNames: new Set(),
    },
    // Boolean-observed scores: boolean literals route to booleanObject while
    // numeric shapes keep the legacy scores_avg lowering (old URLs/saved
    // views), so both must hold the invariants under the same context.
    {
      numericScoreNames: new Set(),
      categoricalScoreNames: new Set(),
      booleanScoreNames: new Set(["accuracy"]),
      traceNumericScoreNames: new Set(),
      traceCategoricalScoreNames: new Set(),
      traceBooleanScoreNames: new Set(["nps"]),
    },
  ],
  fieldValues: ["x", "ERROR", "5", "0.8", "2026-06-01", "true", "a b", "gpt-4"],
  // Adversarial free text — the tokens the parser reserves/quotes. The bare
  // boolean keywords and `!`-prefix here are the exact #4 regression class.
  freeTextValues: [
    "hello",
    "refund policy",
    "or",
    "and",
    "not",
    "OR",
    "AND",
    "NOT",
    "team or kitten",
    "test not really",
    "!important",
    "!critical bug",
    "-foo",
    "a,b",
    "gpt-4-turbo",
    "key:value",
    "(grouped)",
    'has "quote"',
  ],
};

describe("search bar invariants — events v4 registry", () => {
  it("generates a broad field × operator × value matrix", () => {
    // Sanity: the matrix actually exercises the registry (guards against a
    // future refactor silently emptying the generator).
    expect(generateQueryCases(eventsView).length).toBeGreaterThan(1000);
  });

  it("holds all three invariants (parity, round-trip, serialize symmetry)", () => {
    const failures = runSearchBarInvariants(eventsView);
    // Surface every failing case, not just the first, for a fast diagnosis.
    expect(
      failures,
      failures.length === 0
        ? "ok"
        : `\n${failures
            .slice(0, 25)
            .map((f) => `  [${f.invariant}] ${f.case} — ${f.detail}`)
            .join(
              "\n",
            )}${failures.length > 25 ? `\n  …and ${failures.length - 25} more` : ""}`,
    ).toEqual([]);
  });
});
