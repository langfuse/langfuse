import { z } from "zod/v4";
import { DEFAULT_TRACE_ENVIRONMENT } from "../../server/ingestion/types";
import { type EventRecordBaseType } from "../../server/repositories/definitions";
import { ObservationLevel, ObservationType } from "../../domain";
import { SingleValueOption } from "../../tableDefinitions";
import { ColumnDefinition } from "../../tableDefinitions";
import { formatColumnOptions } from "../../tableDefinitions/typeHelpers";

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
  environment: z.string().default(DEFAULT_TRACE_ENVIRONMENT),
  version: z.string().nullish(),
  level: z.string().default(ObservationLevel.DEFAULT),
  status_message: z.string().nullish(),

  // Trace-level properties
  trace_name: z.string().nullish(),
  user_id: z.string().nullish(),
  session_id: z.string().nullish(),
  tags: z.array(z.string()).default([]),
  release: z.string().nullish(),

  // Model
  provided_model_name: z.string().nullish(),
  model_parameters: z.unknown().nullish(),

  // Prompt
  prompt_id: z.string().nullish(),
  prompt_name: z.string().nullish(),
  // Accepts string, number, or any other type from ingestion
  prompt_version: z.union([z.string().nullish(), z.number().nullish()]),

  // Usage & Cost - accepts number values directly from ingestion
  provided_usage_details: flexibleUsageCostSchema,
  provided_cost_details: flexibleUsageCostSchema,
  usage_details: flexibleUsageCostSchema,
  cost_details: flexibleUsageCostSchema,

  // Tool calls
  tool_definitions: z.record(z.string(), z.unknown()).default({}),
  tool_calls: z.array(z.unknown()).default([]),
  tool_call_names: z.array(z.string()).default([]),

  // Experiment
  experiment_id: z.string().nullish(),
  experiment_name: z.string().nullish(),
  experiment_description: z.string().nullish(),
  experiment_dataset_id: z.string().nullish(),
  experiment_item_id: z.string().nullish(),
  experiment_item_expected_output: z.string().nullish(),
  experiment_item_root_span_id: z.string().nullish(),

  // Data - accepts any type (string, array, object) from different OTEL SDKs
  input: z.unknown().nullish(),
  output: z.unknown().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
});

export type ObservationForEval = z.infer<typeof observationForEvalSchema>;

export function convertEventRecordToObservationForEval(
  record: EventRecordBaseType,
): ObservationForEval {
  return observationForEvalSchema.parse(record);
}

type ObservationEvalFilterColumnIdentifiers =
  /** Column identifier (must match an ObservationForEval field name) */
  keyof Pick<
    ObservationForEval,
    | "type"
    | "name"
    | "environment"
    | "level"
    | "version"
    | "release"
    | "trace_name"
    | "user_id"
    | "session_id"
    | "tags"
    | "experiment_dataset_id"
    | "metadata"
  >;

export interface ObservationEvalVariableColumn {
  /** Column identifier (must match an ObservationForEval field name) */
  id: keyof Pick<
    ObservationForEval,
    "input" | "output" | "metadata" | "experiment_item_expected_output"
  >;
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

  {
    id: "experiment_item_expected_output",
    name: "Experiment Item Expected Output",
    description: "Expected output from experiment item",
  },
];

// Eval-specific observation filter columns
// These columns map to fields in ObservationForEval (event records)
// and are used for filtering in observation-based evaluators
type ObservationEvalColumnDef = ColumnDefinition & {
  internal: ObservationEvalFilterColumnIdentifiers;
};

/**
 * Columns available for filtering in observation-based evals.
 * Maps to InMemoryFilterService column mapper.
 *
 * These columns can be used in filter conditions to determine
 * which observations should be evaluated.
 */
export const observationEvalFilterColumns: ObservationEvalColumnDef[] = [
  {
    name: "Type",
    id: "type",
    type: "stringOptions",
    internal: "type",
    options: Object.values(ObservationType).map((key) => ({ value: key })),
  },
  {
    name: "Name",
    id: "name",
    type: "string",
    internal: "name",
  },
  {
    name: "Environment",
    id: "environment",
    type: "stringOptions",
    internal: "environment",
    options: [], // to be filled at runtime
  },
  {
    name: "Level",
    id: "level",
    type: "stringOptions",
    internal: "level",
    options: Object.values(ObservationLevel).map((key) => ({ value: key })),
  },
  {
    name: "Version",
    id: "version",
    type: "string",
    internal: "version",
    nullable: true,
  },
  {
    name: "Release",
    id: "release",
    type: "string",
    internal: "release",
    nullable: true,
  },
  {
    name: "Trace Name",
    id: "traceName",
    type: "stringOptions",
    internal: "trace_name",
    options: [], // to be filled at runtime
    nullable: true,
  },
  {
    name: "User ID",
    id: "userId",
    type: "string",
    internal: "user_id",
    nullable: true,
  },
  {
    name: "Session ID",
    id: "sessionId",
    type: "string",
    internal: "session_id",
    nullable: true,
  },
  {
    name: "Tags",
    id: "tags",
    type: "arrayOptions",
    internal: "tags",
    options: [], // to be filled at runtime
  },
  {
    name: "Metadata",
    id: "metadata",
    type: "stringObject",
    internal: "metadata",
  },
];

// Dataset column for experiment evaluators
export const datasetColForExperiment: ColumnDefinition = {
  name: "Dataset",
  id: "experimentDatasetId",
  type: "stringOptions",
  internal: "experiment_dataset_id",
  options: [], // to be filled at runtime
};

// For event evaluators - all observation columns except dataset
export const evalEventFilterCols: ColumnDefinition[] =
  observationEvalFilterColumns;

// For experiment evaluators - just dataset column
export const evalExperimentFilterCols: ColumnDefinition[] = [
  datasetColForExperiment,
];

// Options type for observation eval filters
export type ObservationEvalOptions = {
  environment?: Array<SingleValueOption>;
  tags?: Array<SingleValueOption>;
  traceName?: Array<SingleValueOption>;
};

export type ExperimentEvalOptions = {
  experimentDatasetId?: Array<SingleValueOption>;
};

export function observationEvalFilterColsWithOptions(
  options?: ObservationEvalOptions,
  cols: ColumnDefinition[] = evalEventFilterCols,
): ColumnDefinition[] {
  return cols.map((col) => {
    if (col.id === "environment") {
      return formatColumnOptions(col, options?.environment ?? []);
    }
    if (col.id === "tags") {
      return formatColumnOptions(col, options?.tags ?? []);
    }
    if (col.id === "traceName") {
      return formatColumnOptions(col, options?.traceName ?? []);
    }
    return col;
  });
}

export function experimentEvalFilterColsWithOptions(
  options?: ExperimentEvalOptions,
  cols: ColumnDefinition[] = evalEventFilterCols,
): ColumnDefinition[] {
  return cols.map((col) => {
    if (col.id === "experimentDatasetId") {
      return formatColumnOptions(col, options?.experimentDatasetId ?? []);
    }
    return col;
  });
}

/**
 * Field mapper for observation eval filters.
 * Maps camelCase filter column IDs to snake_case observation fields.
 * Based on events table column definitions.
 *
 * @param observation - The observation data object
 * @param column - The camelCase column ID from filter definitions
 * @returns The value from the observation object
 */
export function createObservationEvalFieldMapper(
  observation: ObservationForEval,
  column: string,
) {
  const columnMapping = observationEvalFilterColumns.find(
    (c) => c.id === column,
  );
  if (!columnMapping) {
    return undefined;
  }
  return observation[columnMapping.internal];
}
