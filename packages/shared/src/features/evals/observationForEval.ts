import { z } from "zod/v4";

import { eventRecordBaseSchema } from "../../server/repositories/definitions";

/**
 * Extract field schemas from the source of truth (eventRecordBaseSchema).
 *
 * This ensures that any changes to field types in the base schema are automatically
 * reflected in the ObservationForEval schema. If a field is removed from the base
 * schema, TypeScript will error here, preventing silent drift.
 */
const baseFields = eventRecordBaseSchema.shape;

/**
 * Canonical type for observation data used in eval filtering and variable extraction.
 *
 * IMPORTANT: Field schemas are derived from eventRecordBaseSchema to ensure consistency.
 * If you need to change a field type, change it in eventRecordBaseSchema first.
 *
 * This type is produced by two sources:
 * 1. Fresh OTEL events: convertEventInputToObservationForEval()
 * 2. Historical ClickHouse records: convertEventRecordToObservationForEval()
 *
 * It serves as the single source of truth for:
 * - Filter evaluation (shouldEval decision via InMemoryFilterService)
 * - Variable extraction (filling LLM-as-a-judge templates)
 * - S3 storage (serialized observation data for deferred execution)
 */
export const observationForEvalSchema = z.object({
  // ============================================================
  // CORE IDENTIFIERS
  // ============================================================
  /** Observation/span ID */
  id: baseFields.span_id,
  /** Parent trace ID */
  traceId: baseFields.trace_id,
  /** Project ID */
  projectId: baseFields.project_id,
  /** Parent observation ID (for nested spans) */
  parentObservationId: baseFields.parent_span_id,

  // ============================================================
  // OBSERVATION PROPERTIES (for filtering)
  // ============================================================
  /** Observation type: SPAN, GENERATION, EVENT */
  type: baseFields.type,
  /** Observation name */
  name: baseFields.name,
  /** Environment (e.g., production, staging) */
  environment: baseFields.environment,
  /** Log level: DEFAULT, DEBUG, WARNING, ERROR */
  level: baseFields.level,
  /** Status message (error details, etc.) */
  statusMessage: baseFields.status_message,
  /** Version string */
  version: baseFields.version,

  // ============================================================
  // TRACE-LEVEL PROPERTIES (from OTEL span attributes, for filtering)
  // ============================================================
  /** Trace name (from langfuse.trace.name attribute) */
  traceName: baseFields.trace_name,
  /** User ID associated with the trace */
  userId: baseFields.user_id,
  /** Session ID associated with the trace */
  sessionId: baseFields.session_id,
  /** Tags array */
  tags: baseFields.tags,
  /** Release version */
  release: baseFields.release,

  // ============================================================
  // MODEL PROPERTIES (for filtering and variable extraction)
  // ============================================================
  /** Model name (e.g., gpt-4, claude-3) */
  model: baseFields.provided_model_name,
  /** Model parameters (temperature, max_tokens, etc.) as JSON string */
  modelParameters: baseFields.model_parameters,

  // ============================================================
  // PROMPT PROPERTIES (for filtering)
  // ============================================================
  /** Langfuse prompt ID */
  promptId: baseFields.prompt_id,
  /** Langfuse prompt name */
  promptName: baseFields.prompt_name,
  /** Langfuse prompt version */
  promptVersion: baseFields.prompt_version,

  // ============================================================
  // TOOL CALL PROPERTIES (for filtering and variable extraction)
  // ============================================================
  /** Tool definitions map: tool_name -> tool_definition_json */
  toolDefinitions: baseFields.tool_definitions,
  /** Array of tool call JSON strings */
  toolCalls: baseFields.tool_calls,
  /** Array of tool call names (for efficient filtering) */
  toolCallNames: baseFields.tool_call_names,

  // ============================================================
  // USAGE & COST (for filtering and variable extraction)
  // ============================================================
  /** Calculated usage details (tokens) */
  usageDetails: baseFields.usage_details,
  /** Calculated cost details */
  costDetails: baseFields.cost_details,
  /** User-provided usage details */
  providedUsageDetails: baseFields.provided_usage_details,
  /** User-provided cost details */
  providedCostDetails: baseFields.provided_cost_details,

  // ============================================================
  // EXPERIMENT PROPERTIES (for filtering and variable extraction)
  // ============================================================
  /** Experiment ID */
  experimentId: baseFields.experiment_id,
  /** Experiment name */
  experimentName: baseFields.experiment_name,
  /** Experiment description */
  experimentDescription: baseFields.experiment_description,
  /** Dataset ID associated with experiment */
  experimentDatasetId: baseFields.experiment_dataset_id,
  /** Dataset item ID */
  experimentItemId: baseFields.experiment_item_id,
  /** Expected output from dataset item (for comparison in evals) */
  experimentItemExpectedOutput: baseFields.experiment_item_expected_output,

  // ============================================================
  // DATA FIELDS (primary variable extraction targets)
  // ============================================================
  /** Input data (JSON string) */
  input: baseFields.input,
  /** Output data (JSON string) */
  output: baseFields.output,
  /** Metadata map */
  metadata: baseFields.metadata,
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
  { id: "traceName", name: "Trace Name", type: "string" },
  { id: "userId", name: "User ID", type: "string" },
  { id: "sessionId", name: "Session ID", type: "string" },
  { id: "tags", name: "Tags", type: "arrayOptions" },
  { id: "release", name: "Release", type: "string" },

  // Model properties
  { id: "model", name: "Model", type: "stringOptions" },

  // Prompt properties
  { id: "promptName", name: "Prompt Name", type: "stringOptions" },

  // Tool properties
  { id: "toolCallNames", name: "Tool Call Names", type: "arrayOptions" },

  // Experiment properties
  { id: "experimentId", name: "Experiment ID", type: "string" },
  { id: "experimentName", name: "Experiment Name", type: "string" },

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
    id: "toolDefinitions",
    name: "Tool Definitions",
    description: "Available tool definitions",
  },
  {
    id: "toolCalls",
    name: "Tool Calls",
    description: "Tool calls with arguments",
  },

  // Model data
  {
    id: "model",
    name: "Model",
    description: "Model name used",
  },
  {
    id: "modelParameters",
    name: "Model Parameters",
    description: "Model configuration parameters",
  },

  // Usage data
  {
    id: "usageDetails",
    name: "Usage Details",
    description: "Token usage breakdown",
  },
  {
    id: "costDetails",
    name: "Cost Details",
    description: "Cost breakdown",
  },

  // Experiment data
  {
    id: "experimentItemExpectedOutput",
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
