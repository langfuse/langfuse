import { observationEvalVariableColumns } from "@langfuse/shared";

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

export const OUTPUT_MAPPING = [
  "generation",
  "output",
  "response",
  "answer",
  "completion",
];

export const DEFAULT_TRACE_FILTER = [];

// Observation evaluators default to generations to avoid targeting every span.
export const DEFAULT_OBSERVATION_FILTER = [
  {
    column: "type",
    operator: "any of" as const,
    value: ["GENERATION"],
    type: "stringOptions" as const,
  },
];

// Default filter when remapping an evaluator from trace-level to observation-level
export const DEFAULT_OBSERVATION_FILTER_WHEN_REMAPPING = [
  {
    column: "isRootObservation",
    operator: "=" as const,
    value: true,
    type: "boolean" as const,
  },
];

// v3 SDKs do not set the app-root marker. Their top-level observations are
// identified by having no parent observation.
export const DEFAULT_OBSERVATION_FILTER_WHEN_REMAPPING_V3 = [
  {
    column: "parentObservationId",
    operator: "is null" as const,
    value: "" as const,
    type: "null" as const,
  },
];
