import { z } from "zod/v4";

/**
 * ObservationForEval schema - fields needed for observation-level evaluations.
 *
 * IMPORTANT: Why this is a custom schema instead of picking from eventRecordBaseSchema
 * =====================================================================================
 *
 * The ingestion pipeline (createEventRecord in IngestionService) intentionally uses
 * loose types that don't strictly conform to eventRecordBaseSchema. This is by design:
 *
 * 1. The ClickHouse SDK performs its own type transformations (e.g., objects to JSON strings)
 * 2. We want flexibility during ingestion to accept various OTEL SDK formats
 * 3. Strict schema validation at ingestion time would reject valid data from vendor SDKs
 *
 * As a result, eventRecordBaseSchema expects strict types (e.g., model_parameters as string)
 * but createEventRecord produces looser types (e.g., model_parameters as object).
 *
 * This schema uses relaxed types to accept data directly from the ingestion pipeline:
 * - model_parameters: accepts both string (from ClickHouse reads) and object (from ingestion)
 * - prompt_version: accepts both string and number
 * - input/output: accepts string, array, or object (different OTEL SDKs produce different formats)
 * - metadata: accepts Record<string, unknown> for flexibility
 *
 * Test coverage: worker/src/queues/__tests__/otelToObservationForEval.test.ts
 * verifies that OTEL spans from various SDKs pass this schema after ingestion.
 */

// Flexible schema for usage/cost that accepts number values directly from ingestion
const flexibleUsageCostSchema = z.record(z.string(), z.number().nullable());

export const observationForEvalSchema = z.object({
  // Identifiers
  span_id: z.string(),
  trace_id: z.string(),
  project_id: z.string(),
  parent_span_id: z.string().nullish(),

  // Core properties
  type: z.string(),
  name: z.string(),
  environment: z.string().default("default"),
  version: z.string().nullish(),
  release: z.string().nullish(),
  level: z.string(),
  status_message: z.string().nullish(),

  // Trace-level properties
  trace_name: z.string().nullish(),
  user_id: z.string().nullish(),
  session_id: z.string().nullish(),
  tags: z.array(z.string()).default([]),

  // Model
  provided_model_name: z.string().nullish(),
  // Accepts string, object, or any other type from ingestion
  model_parameters: z.unknown().optional(),

  // Prompt
  prompt_id: z.string().nullish(),
  prompt_name: z.string().nullish(),
  // Accepts string, number, or any other type from ingestion
  prompt_version: z.unknown().optional(),

  // Usage & Cost - accepts number values directly from ingestion
  provided_usage_details: flexibleUsageCostSchema,
  provided_cost_details: flexibleUsageCostSchema,
  usage_details: flexibleUsageCostSchema,
  cost_details: flexibleUsageCostSchema,

  // Tool calls
  tool_definitions: z.record(z.string(), z.string()).default({}),
  tool_calls: z.array(z.string()).default([]),
  tool_call_names: z.array(z.string()).default([]),

  // Experiment
  experiment_id: z.string().nullish(),
  experiment_name: z.string().nullish(),
  experiment_description: z.string().nullish(),
  experiment_dataset_id: z.string().nullish(),
  experiment_item_id: z.string().nullish(),
  experiment_item_expected_output: z.string().nullish(),

  // Data - accepts any type (string, array, object) from different OTEL SDKs
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  // Flexible metadata that accepts any value types
  metadata: z.record(z.string(), z.unknown()).optional(),
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

  // Prompt data
  {
    id: "prompt_version",
    name: "Prompt Version",
    description: "Version of the prompt used",
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
