import { z } from "zod/v4";

import { eventRecordBaseSchema } from "../../server/repositories/definitions";

/**
 * ObservationForEval schema - a subset of eventRecordBaseSchema fields
 * needed for observation-level evaluations.
 *
 * IMPORTANT:
 * - This schema uses snake_case field names matching eventRecordBaseSchema
 * - The shape dictates the S3 JSON format for observation evals
 * - Changes here affect ingestion, in-flight evaluations, and historical evals
 */
export const observationForEvalSchema = eventRecordBaseSchema.pick({
  // Identifiers
  span_id: true,
  trace_id: true,
  project_id: true,
  parent_span_id: true,

  // Core properties
  type: true,
  name: true,
  environment: true,
  version: true,
  release: true,
  level: true,
  status_message: true,

  // Trace-level properties
  trace_name: true,
  user_id: true,
  session_id: true,
  tags: true,

  // Model
  provided_model_name: true,
  model_parameters: true,

  // Prompt
  prompt_id: true,
  prompt_name: true,
  prompt_version: true,

  // Usage & Cost
  provided_usage_details: true,
  provided_cost_details: true,
  usage_details: true,
  cost_details: true,

  // Tool calls
  tool_definitions: true,
  tool_calls: true,
  tool_call_names: true,

  // Experiment
  experiment_id: true,
  experiment_name: true,
  experiment_description: true,
  experiment_dataset_id: true,
  experiment_item_id: true,
  experiment_item_expected_output: true,

  // Data
  input: true,
  output: true,
  metadata: true,
});

export type ObservationForEval = z.infer<typeof observationForEvalSchema>;

// ============================================================
// FILTER COLUMN DEFINITIONS
// ============================================================

/**
 * Column definition for observation eval filtering.
 * The `id` is typed as `keyof ObservationForEval` to ensure compile-time safety.
 */
export interface ObservationEvalFilterColumn {
  /** Column identifier (must match an ObservationForEval field name) */
  id: keyof ObservationForEval;
  /** Display name for UI */
  name: string;
  /** Filter type for UI rendering */
  type: "string" | "stringOptions" | "stringObject" | "arrayOptions" | "number";
}

/**
 * Columns available for filtering in observation-based evals.
 * Maps to InMemoryFilterService column mapper.
 *
 * These columns can be used in filter conditions to determine
 * which observations should be evaluated.
 */
export const observationEvalFilterColumns: ObservationEvalFilterColumn[] = [
  // Observation properties
  { id: "type", name: "Type", type: "stringOptions" },
  { id: "name", name: "Name", type: "string" },
  { id: "environment", name: "Environment", type: "stringOptions" },
  { id: "level", name: "Level", type: "stringOptions" },
  { id: "version", name: "Version", type: "string" },

  // Trace-level properties
  { id: "trace_name", name: "Trace Name", type: "string" },
  { id: "user_id", name: "User ID", type: "string" },
  { id: "session_id", name: "Session ID", type: "string" },
  { id: "tags", name: "Tags", type: "arrayOptions" },
  { id: "release", name: "Release", type: "string" },

  // Model properties
  { id: "provided_model_name", name: "Model", type: "stringOptions" },

  // Prompt properties
  { id: "prompt_name", name: "Prompt Name", type: "stringOptions" },

  // Tool properties
  { id: "tool_call_names", name: "Tool Call Names", type: "arrayOptions" },

  // Experiment properties
  { id: "experiment_id", name: "Experiment ID", type: "string" },
  { id: "experiment_name", name: "Experiment Name", type: "string" },

  // Metadata (supports JSON path filtering)
  { id: "metadata", name: "Metadata", type: "stringObject" },
];

/**
 * Type for valid filter column IDs.
 */
export type ObservationEvalFilterColumnId =
  (typeof observationEvalFilterColumns)[number]["id"];

// ============================================================
// VARIABLE COLUMN DEFINITIONS
// ============================================================

/**
 * Column definition for observation eval variable extraction.
 * The `id` is typed as `keyof ObservationForEval` to ensure compile-time safety.
 */
export interface ObservationEvalVariableColumn {
  /** Column identifier (must match an ObservationForEval field name) */
  id: keyof ObservationForEval;
  /** Display name for UI */
  name: string;
  /** Description for UI tooltips */
  description: string;
  /** Optional type hint for special handling (e.g., stringObject for metadata) */
  type?: "stringObject";
}

/**
 * Columns available for variable extraction in observation-based evals.
 * These are the fields that can be mapped to template variables.
 *
 * When configuring an eval, users can map these columns to template
 * variables like {{input}}, {{output}}, {{expected_output}}, etc.
 */
export const observationEvalVariableColumns: ObservationEvalVariableColumn[] = [
  // Primary data fields
  {
    id: "input",
    name: "Input",
    description: "Observation input data",
  },
  {
    id: "output",
    name: "Output",
    description: "Observation output data",
  },
  {
    id: "metadata",
    name: "Metadata",
    description: "Observation metadata",
    type: "stringObject",
  },

  // Tool call data
  {
    id: "tool_definitions",
    name: "Tool Definitions",
    description: "Available tool definitions",
  },
  {
    id: "tool_calls",
    name: "Tool Calls",
    description: "Tool calls with arguments",
  },

  // Model data
  {
    id: "provided_model_name",
    name: "Model",
    description: "Model name used",
  },
  {
    id: "model_parameters",
    name: "Model Parameters",
    description: "Model configuration parameters",
  },

  // Usage data
  {
    id: "usage_details",
    name: "Usage Details",
    description: "Token usage breakdown",
  },
  {
    id: "cost_details",
    name: "Cost Details",
    description: "Cost breakdown",
  },

  // Experiment data
  {
    id: "experiment_item_expected_output",
    name: "Expected Output",
    description: "Expected output from dataset item",
  },
];

/**
 * Type for valid variable column IDs.
 */
export type ObservationEvalVariableColumnId =
  (typeof observationEvalVariableColumns)[number]["id"];

// ============================================================
// UI CONFIGURATION
// ============================================================

/**
 * UI-friendly representation for the evaluator form.
 * Used in inner-evaluator-form.tsx for the variable mapping UI.
 *
 * This differs from trace evals where you select from multiple objects
 * (trace, generation, span, etc.). For observation evals, there's only
 * the single observation being evaluated.
 */
export const availableObservationEvalVariablesUI = [
  {
    id: "observation",
    display: "Observation",
    availableColumns: observationEvalVariableColumns.map((col) => ({
      id: col.id,
      name: col.name,
      type: col.type,
    })),
  },
] as const;
