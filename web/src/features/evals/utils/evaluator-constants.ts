import {
  LangfuseInternalTraceEnvironment,
  observationEvalVariableColumns,
} from "@langfuse/shared";

/**
 * Constant for observation-based evaluators (event/experiment).
 * Provides the available variables structure for the UI dropdowns.
 */
export const OBSERVATION_VARIABLES = [
  {
    id: "observation",
    display: "Observation",
    availableColumns: observationEvalVariableColumns.map((col) => ({
      // id corresponds to the internal column name
      id: col.id,
      name: col.name,
      ...(col.type ? { type: col.type } : {}),
      internal: col.internal,
    })),
  },
];

export const COLUMN_IDENTIFIERS_THAT_REQUIRE_PROPAGATION = new Set([
  "release",
  "traceName",
  "userId",
  "sessionId",
  "tags",
]);

export const OUTPUT_MAPPING = [
  "generation",
  "output",
  "response",
  "answer",
  "completion",
];

export const INTERNAL_ENVIRONMENTS = [
  LangfuseInternalTraceEnvironment.LLMJudge,
  "langfuse-prompt-experiment",
  "langfuse-evaluation",
  "sdk-experiment",
] as const;

// Default filter for new trace evaluators - excludes internal Langfuse environments
// to prevent evaluators from running on their own traces
export const DEFAULT_TRACE_FILTER = [
  {
    column: "environment",
    operator: "none of" as const,
    value: [...INTERNAL_ENVIRONMENTS],
    type: "stringOptions" as const,
  },
];

// Default filter for new observation evaluators - restricts to GENERATION type
// to prevent evaluators from running on every observation by default
export const DEFAULT_OBSERVATION_FILTER = [
  {
    column: "type",
    operator: "any of" as const,
    value: ["GENERATION"],
    type: "stringOptions" as const,
  },
  {
    column: "environment",
    operator: "none of" as const,
    value: [...INTERNAL_ENVIRONMENTS],
    type: "stringOptions" as const,
  },
];

// Default filter when remapping an evaluator from trace-level to observation-level
export const DEFAULT_OBSERVATION_FILTER_WHEN_REMAPPING = [
  {
    column: "parentObservationId",
    operator: "is null" as const,
    value: "",
    type: "null" as const,
  },
];
