import { describe, expect, it } from "vitest";

import { getExperimentsFilterConfig } from "@/src/features/experiments/components/table/filter-config";
import { evalLogFilterConfig } from "@/src/features/filters/config/eval-logs-config";
import { evaluatorFilterConfig } from "@/src/features/filters/config/evaluators-config";
import { monitorFilterConfig } from "@/src/features/filters/config/monitors-config";
import { getScoreFilterConfig } from "@/src/features/filters/config/scores-config";
import { getSessionFilterConfig } from "@/src/features/filters/config/sessions-config";

import { eventsSearchBarRegistry } from "./fields";
import {
  createEvalLogsSearchBarRegistry,
  createEvaluatorsSearchBarRegistry,
  createExperimentsSearchBarRegistry,
  createMonitorsSearchBarRegistry,
  createScoresSearchBarRegistry,
  createSessionsSearchBarRegistry,
} from "./registries";
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
  registry: eventsSearchBarRegistry,
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

const filterOnlyFieldValues = [
  "x",
  "ERROR",
  "5",
  "0.8",
  "2026-06-01",
  "true",
  "a b",
];

const sessionsView: RegistryUnderTest = {
  name: "sessions v4",
  registry: createSessionsSearchBarRegistry(
    getSessionFilterConfig().columnDefinitions,
  ),
  extraKeys: ["scores.accuracy", "scores.feedback", "has:commentContent"],
  scoreContexts: [
    {
      numericScoreNames: new Set(["accuracy"]),
      categoricalScoreNames: new Set(["feedback"]),
      traceNumericScoreNames: new Set(),
      traceCategoricalScoreNames: new Set(),
    },
    {
      numericScoreNames: new Set(),
      categoricalScoreNames: new Set(["accuracy", "feedback"]),
      traceNumericScoreNames: new Set(),
      traceCategoricalScoreNames: new Set(),
    },
  ],
  fieldValues: filterOnlyFieldValues,
  freeTextValues: [],
};

const scoresView: RegistryUnderTest = {
  name: "scores v4",
  registry: createScoresSearchBarRegistry(
    getScoreFilterConfig().columnDefinitions,
  ),
  extraKeys: ["has:stringValue"],
  scoreContexts: [],
  fieldValues: filterOnlyFieldValues,
  freeTextValues: [],
};

const experimentsView: RegistryUnderTest = {
  name: "experiments",
  registry: createExperimentsSearchBarRegistry(
    getExperimentsFilterConfig().columnDefinitions,
  ),
  extraKeys: [
    "metadata.region",
    "scores.accuracy",
    "traceScores.nps",
    "has:description",
  ],
  scoreContexts: [
    {
      numericScoreNames: new Set(["accuracy"]),
      categoricalScoreNames: new Set(["feedback"]),
      traceNumericScoreNames: new Set(),
      traceCategoricalScoreNames: new Set(["nps"]),
    },
    {
      numericScoreNames: new Set(),
      categoricalScoreNames: new Set(["accuracy", "feedback"]),
      traceNumericScoreNames: new Set(["nps"]),
      traceCategoricalScoreNames: new Set(),
    },
  ],
  fieldValues: filterOnlyFieldValues,
  freeTextValues: [],
};

const evaluatorsView: RegistryUnderTest = {
  name: "evaluators",
  registry: createEvaluatorsSearchBarRegistry(
    evaluatorFilterConfig.columnDefinitions,
  ),
  extraKeys: ["has:updatedAt"],
  scoreContexts: [],
  fieldValues: filterOnlyFieldValues,
  freeTextValues: [],
};

const evalLogsView: RegistryUnderTest = {
  name: "eval logs",
  registry: createEvalLogsSearchBarRegistry(
    evalLogFilterConfig.columnDefinitions,
  ),
  extraKeys: ["has:traceId"],
  scoreContexts: [],
  fieldValues: filterOnlyFieldValues,
  freeTextValues: [],
};

const monitorsView: RegistryUnderTest = {
  name: "monitors",
  registry: createMonitorsSearchBarRegistry(
    monitorFilterConfig.columnDefinitions,
  ),
  extraKeys: ["has:tags"],
  scoreContexts: [],
  fieldValues: filterOnlyFieldValues,
  freeTextValues: [],
};

function expectNoInvariantFailures(view: RegistryUnderTest) {
  const failures = runSearchBarInvariants(view);
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
}

describe("search bar invariants - events v4 registry", () => {
  it("generates a broad field × operator × value matrix", () => {
    // Sanity: the matrix actually exercises the registry (guards against a
    // future refactor silently emptying the generator).
    expect(generateQueryCases(eventsView).length).toBeGreaterThan(1000);
  });

  it("holds all three invariants (parity, round-trip, serialize symmetry)", () => {
    expectNoInvariantFailures(eventsView);
  });
});

describe.each([
  sessionsView,
  scoresView,
  experimentsView,
  evaluatorsView,
  evalLogsView,
  monitorsView,
])("search bar invariants - $name registry", (view) => {
  it("generates a non-empty field × operator × value matrix", () => {
    expect(generateQueryCases(view).length).toBeGreaterThan(0);
  });

  it("holds registry invariants", () => {
    expectNoInvariantFailures(view);
  });
});
