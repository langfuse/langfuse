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
      id: col.id,
      name: col.name,
      ...(col.type ? { type: col.type } : {}),
      internal: `o."${col.id}"`,
    })),
  },
];
