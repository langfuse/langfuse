import { describe, expect, it } from "vitest";

import type { ColumnDefinition } from "@langfuse/shared";

import { eventsSearchBarRegistry } from "./fields";
import {
  createDatasetsSearchBarRegistry,
  createEvalLogsSearchBarRegistry,
  createEvaluatorsSearchBarRegistry,
  createExperimentsSearchBarRegistry,
  createMonitorsSearchBarRegistry,
  createScoresSearchBarRegistry,
  createSessionsSearchBarRegistry,
  createUsersSearchBarRegistry,
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

const nonEventsFreeTextValues = [
  "hello",
  "user search",
  "or",
  "not",
  "!important",
  "-foo",
  "key:value",
  'has "quote"',
];

const SESSION_COLUMNS: ColumnDefinition[] = [
  {
    name: "Session ID",
    id: "id",
    type: "string",
    internal: "id",
    nullable: true,
  },
  {
    name: "Environment",
    id: "environment",
    type: "stringOptions",
    internal: "environment",
    options: [],
    nullable: true,
  },
  {
    name: "User IDs",
    id: "userIds",
    type: "arrayOptions",
    internal: "userIds",
    options: [],
    nullable: true,
  },
  {
    name: "Trace Tags",
    id: "tags",
    type: "arrayOptions",
    internal: "tags",
    options: [],
    nullable: true,
  },
  {
    name: "Session Duration",
    id: "sessionDuration",
    type: "number",
    internal: "sessionDuration",
    nullable: true,
  },
  {
    name: "Trace Count",
    id: "countTraces",
    type: "number",
    internal: "countTraces",
    nullable: true,
  },
  {
    name: "Input Tokens",
    id: "inputTokens",
    type: "number",
    internal: "inputTokens",
    nullable: true,
  },
  {
    name: "Output Tokens",
    id: "outputTokens",
    type: "number",
    internal: "outputTokens",
    nullable: true,
  },
  {
    name: "Total Tokens",
    id: "totalTokens",
    type: "number",
    internal: "totalTokens",
    nullable: true,
  },
  {
    name: "Input Cost",
    id: "inputCost",
    type: "number",
    internal: "inputCost",
    nullable: true,
  },
  {
    name: "Output Cost",
    id: "outputCost",
    type: "number",
    internal: "outputCost",
    nullable: true,
  },
  {
    name: "Total Cost",
    id: "totalCost",
    type: "number",
    internal: "totalCost",
    nullable: true,
  },
  {
    name: "Comment Count",
    id: "commentCount",
    type: "number",
    internal: "commentCount",
  },
  {
    name: "Comment Content",
    id: "commentContent",
    type: "string",
    internal: "commentContent",
    nullable: true,
  },
];

const SCORE_COLUMNS: ColumnDefinition[] = [
  {
    name: "Trace ID",
    id: "traceId",
    type: "string",
    internal: "traceId",
    nullable: true,
  },
  {
    name: "Session ID",
    id: "sessionId",
    type: "string",
    internal: "sessionId",
    nullable: true,
  },
  {
    name: "Observation ID",
    id: "observationId",
    type: "string",
    internal: "observationId",
    nullable: true,
  },
  {
    name: "Environment",
    id: "environment",
    type: "stringOptions",
    internal: "environment",
    options: [],
    nullable: true,
  },
  {
    name: "Name",
    id: "name",
    type: "stringOptions",
    internal: "name",
    options: [],
  },
  {
    name: "Source",
    id: "source",
    type: "stringOptions",
    internal: "source",
    options: [],
  },
  {
    name: "Data Type",
    id: "dataType",
    type: "stringOptions",
    internal: "dataType",
    options: [],
  },
  {
    name: "Categorical Value",
    id: "stringValue",
    type: "stringOptions",
    internal: "stringValue",
    options: [],
    nullable: true,
  },
  {
    name: "User ID",
    id: "userId",
    type: "stringOptions",
    internal: "userId",
    options: [],
    nullable: true,
  },
  {
    name: "Trace Tags",
    id: "tags",
    type: "arrayOptions",
    internal: "tags",
    options: [],
    nullable: true,
  },
];

const EXPERIMENT_COLUMNS: ColumnDefinition[] = [
  {
    name: "Experiment ID",
    id: "id",
    type: "string",
    internal: "id",
  },
  {
    name: "Name",
    id: "name",
    type: "stringOptions",
    internal: "name",
    options: [],
  },
  {
    name: "Dataset ID",
    id: "experimentDatasetId",
    type: "stringOptions",
    internal: "experimentDatasetId",
    options: [],
  },
  {
    name: "Start Time",
    id: "startTime",
    type: "datetime",
    internal: "startTime",
  },
  {
    name: "Item Count",
    id: "itemCount",
    type: "number",
    internal: "itemCount",
  },
  {
    name: "Total Cost",
    id: "totalCost",
    type: "number",
    internal: "totalCost",
    nullable: true,
  },
  {
    name: "Latency Average",
    id: "latencyAvg",
    type: "number",
    internal: "latencyAvg",
    nullable: true,
  },
  {
    name: "Error Count",
    id: "errorCount",
    type: "number",
    internal: "errorCount",
  },
  {
    name: "Description",
    id: "description",
    type: "string",
    internal: "description",
    nullable: true,
  },
  {
    name: "Metadata",
    id: "metadata",
    type: "stringObject",
    internal: "metadata",
  },
];

const EVALUATOR_COLUMNS: ColumnDefinition[] = [
  {
    name: "Status",
    id: "status",
    type: "stringOptions",
    internal: "status",
    options: [],
  },
  {
    name: "Target",
    id: "target",
    type: "stringOptions",
    internal: "target",
    options: [],
  },
  {
    name: "Updated At",
    id: "updatedAt",
    type: "datetime",
    internal: "updatedAt",
    nullable: true,
  },
  {
    name: "Created At",
    id: "createdAt",
    type: "datetime",
    internal: "createdAt",
  },
];

const EVAL_LOG_COLUMNS: ColumnDefinition[] = [
  {
    name: "Status",
    id: "status",
    type: "stringOptions",
    internal: "status",
    options: [],
  },
  {
    name: "Trace ID",
    id: "traceId",
    type: "string",
    internal: "traceId",
    nullable: true,
  },
  {
    name: "Execution Trace ID",
    id: "executionTraceId",
    type: "string",
    internal: "executionTraceId",
    nullable: true,
  },
];

const MONITOR_COLUMNS: ColumnDefinition[] = [
  {
    name: "Severity",
    id: "severity",
    type: "stringOptions",
    internal: "severity",
    options: [],
  },
  {
    name: "Status",
    id: "status",
    type: "stringOptions",
    internal: "status",
    options: [],
  },
  {
    name: "Tags",
    id: "tags",
    type: "arrayOptions",
    internal: "tags",
    options: [],
    nullable: true,
  },
];

const USER_COLUMNS: ColumnDefinition[] = [
  {
    name: "Timestamp",
    id: "timestamp",
    type: "datetime",
    internal: "timestamp",
  },
  {
    name: "User ID",
    id: "userId",
    type: "stringOptions",
    internal: "userId",
    options: [],
  },
];

const sessionsView: RegistryUnderTest = {
  name: "sessions v4",
  registry: createSessionsSearchBarRegistry(SESSION_COLUMNS),
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
  registry: createScoresSearchBarRegistry(SCORE_COLUMNS),
  extraKeys: ["has:stringValue"],
  scoreContexts: [],
  fieldValues: filterOnlyFieldValues,
  freeTextValues: [],
};

const experimentsView: RegistryUnderTest = {
  name: "experiments",
  registry: createExperimentsSearchBarRegistry(EXPERIMENT_COLUMNS),
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
  registry: createEvaluatorsSearchBarRegistry(EVALUATOR_COLUMNS),
  extraKeys: ["has:updatedAt"],
  scoreContexts: [],
  fieldValues: filterOnlyFieldValues,
  freeTextValues: nonEventsFreeTextValues,
};

const evalLogsView: RegistryUnderTest = {
  name: "eval logs",
  registry: createEvalLogsSearchBarRegistry(EVAL_LOG_COLUMNS),
  extraKeys: ["has:traceId"],
  scoreContexts: [],
  fieldValues: filterOnlyFieldValues,
  freeTextValues: [],
};

const monitorsView: RegistryUnderTest = {
  name: "monitors",
  registry: createMonitorsSearchBarRegistry(MONITOR_COLUMNS),
  extraKeys: ["has:tags"],
  scoreContexts: [],
  fieldValues: filterOnlyFieldValues,
  freeTextValues: [],
};

const usersView: RegistryUnderTest = {
  name: "users",
  registry: createUsersSearchBarRegistry(USER_COLUMNS),
  extraKeys: [],
  scoreContexts: [],
  fieldValues: filterOnlyFieldValues,
  freeTextValues: nonEventsFreeTextValues,
};

const datasetsView: RegistryUnderTest = {
  name: "datasets",
  registry: createDatasetsSearchBarRegistry(),
  extraKeys: [],
  scoreContexts: [],
  fieldValues: [],
  freeTextValues: nonEventsFreeTextValues,
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
  usersView,
])("search bar invariants - $name registry", (view) => {
  it("generates a non-empty field × operator × value matrix", () => {
    expect(generateQueryCases(view).length).toBeGreaterThan(0);
  });

  it("holds registry invariants", () => {
    expectNoInvariantFailures(view);
  });
});

describe("search bar invariants - datasets registry", () => {
  it("has no field filter matrix because datasets is free-text only", () => {
    expect(generateQueryCases(datasetsView)).toEqual([]);
  });

  it("holds free-text registry invariants", () => {
    expectNoInvariantFailures(datasetsView);
  });
});
