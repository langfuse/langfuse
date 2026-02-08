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

export type ObservationEvalFilterColumnInternal =
  /** Column identifier (must match an ObservationForEval field name) */
  keyof Pick<
    ObservationForEval,
    | "type"
    | "name"
    | "environment"
    | "level"
    | "version"
    | "trace_name"
    | "user_id"
    | "session_id"
    | "tags"
    | "experiment_dataset_id"
    | "metadata"
  >;

export type ObservationEvalMappingColumnInternal = keyof Pick<
  ObservationForEval,
  "input" | "output" | "metadata" | "experiment_item_expected_output"
>;

export interface ObservationEvalVariableColumn {
  /** Column identifier (must match an ObservationForEval field name) */
  id: string;
  /** Display name for UI */
  name: string;
  /** Description for UI tooltips */
  description: string;
  /** Optional type hint for special handling (e.g., stringObject for metadata) */
  type?: "stringObject";
  internal: ObservationEvalMappingColumnInternal;
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
    internal: "input",
  },
  {
    id: "output",
    name: "Output",
    description: "Observation output data",
    internal: "output",
  },
  {
    id: "metadata",
    name: "Metadata",
    description: "Observation metadata",
    type: "stringObject",
    internal: "metadata",
  },
  {
    id: "experimentItemExpectedOutput",
    name: "Expected Output",
    description: "Expected output from experiment item",
    internal: "experiment_item_expected_output",
  },
];

export const availableObservationEvalVariableColumns = [
  ...observationEvalVariableColumns,
  {
    id: "toolCalls",
    name: "Tool Calls",
    description: "Tool calls",
    internal: "tool_calls",
  },
  {
    id: "toolDefinitions",
    name: "Tool Definitions",
    description: "Tool definitions",
    internal: "tool_definitions",
  },
  {
    id: "toolCallNames",
    name: "Tool Call Names",
    description: "Tool call names",
    internal: "tool_call_names",
  },
  {
    id: "providedModelName",
    name: "Model",
    description: "Model",
    internal: "provided_model_name",
  },
  {
    id: "modelParameters",
    name: "Model Parameters",
    description: "Model parameters",
    internal: "model_parameters",
  },
  {
    id: "usageDetails",
    name: "Usage Details",
    description: "Usage details",
    internal: "usage_details",
  },
  {
    id: "costDetails",
    name: "Cost Details",
    description: "Cost details",
    internal: "cost_details",
  },
];

type ObservationEvalColumnDef = ColumnDefinition & {
  internal: ObservationEvalFilterColumnInternal;
};

/**
 * Columns available for filtering in observation-based evals.
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
    type: "stringOptions",
    internal: "name",
    options: [], // to be filled at runtime
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

export const experimentEvalFilterColumns: ObservationEvalColumnDef[] = [
  {
    name: "Dataset",
    id: "experimentDatasetId",
    type: "stringOptions",
    internal: "experiment_dataset_id",
    options: [], // to be filled at runtime
  },
];

export const eventsEvalFilterColumns: ObservationEvalColumnDef[] = [
  ...observationEvalFilterColumns,
  ...experimentEvalFilterColumns,
];

// Options type for observation eval filters
export type ObservationEvalOptions = {
  environment?: Array<SingleValueOption>;
  tags?: Array<SingleValueOption>;
  traceName?: Array<SingleValueOption>;
  name?: Array<SingleValueOption>;
};

export type ExperimentEvalOptions = {
  experimentDatasetId?: Array<SingleValueOption>;
};

export function observationEvalFilterColsWithOptions(
  options?: ObservationEvalOptions,
  cols: ColumnDefinition[] = observationEvalFilterColumns,
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
    if (col.id === "name") {
      return formatColumnOptions(col, options?.name ?? []);
    }
    return col;
  });
}

export function experimentEvalFilterColsWithOptions(
  options?: ExperimentEvalOptions,
  cols: ColumnDefinition[] = experimentEvalFilterColumns,
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
export function mapEventEvalFilterColumnIdToField(
  observation: ObservationForEval,
  column: string,
) {
  const columnMapping = eventsEvalFilterColumns.find((c) => c.id === column);
  if (!columnMapping) {
    return undefined;
  }
  return observation[columnMapping.internal];
}
