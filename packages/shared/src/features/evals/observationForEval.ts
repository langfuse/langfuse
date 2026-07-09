import { z } from "zod";
import { DEFAULT_TRACE_ENVIRONMENT } from "../../server/ingestion/types";
import { type EventRecordBaseType } from "../../server/repositories/definitions";
import { ObservationLevel, ObservationType } from "../../domain";
import { metadataArraysToRecord } from "../../server/utils/metadata_conversion";
import { SingleValueOption } from "../../tableDefinitions";
import { ColumnDefinition } from "../../tableDefinitions";
import { formatColumnOptions } from "../../tableDefinitions/typeHelpers";
import { parseJsonIfString } from "../../utils/json";

const flexibleUsageCostSchema = z.record(
  z.string(),
  z.coerce.number().nullable(),
);

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
  tool_call_count: z.number().default(0),

  // Experiment
  experiment_id: z.string().nullish(),
  experiment_name: z.string().nullish(),
  experiment_description: z.string().nullish(),
  experiment_dataset_id: z.string().nullish(),
  experiment_item_id: z.string().nullish(),
  experiment_item_expected_output: z.string().nullish(),
  experiment_item_metadata: z.record(z.string(), z.unknown()).nullish(),
  experiment_item_root_span_id: z.string().nullish(),

  // Data - accepts any type (string, array, object) from different OTEL SDKs
  input: z.unknown().nullish(),
  output: z.unknown().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
});

export type ObservationForEval = z.infer<typeof observationForEvalSchema>;

/**
 * Self-contained tool call shape handed to evaluators. Rebuilt from the
 * ClickHouse storage layout, which keeps names in a parallel array
 * (`tool_call_names`) so ClickHouse can filter without JSON parsing.
 */
export const toolCallForEvalSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.unknown(),
  type: z.string(),
  index: z.number(),
});

export type ToolCallForEval = z.infer<typeof toolCallForEvalSchema>;

/**
 * zipObservationToolCalls for camelCase records with loosely typed arrays
 * (tRPC/domain shapes: events batchIO, legacy observations.byId). Malformed
 * names map to "" instead of being dropped — filtering would shift the zip
 * and misattribute every later call's name.
 */
export function zipToolCallsFromRecord(record: object): ToolCallForEval[] {
  const { toolCalls, toolCallNames } = record as {
    toolCalls?: unknown;
    toolCallNames?: unknown;
  };

  return zipObservationToolCalls({
    tool_calls: Array.isArray(toolCalls) ? toolCalls : [],
    tool_call_names: Array.isArray(toolCallNames)
      ? toolCallNames.map((name) => (typeof name === "string" ? name : ""))
      : [],
  });
}

/**
 * Zips the parallel arrays back into named tool call objects.
 * `tool_call_names` is authoritative for count and order: ingestion writes
 * both arrays in lockstep (`convertCallsToArrays`), and stored entries carry
 * no name. `arguments` arrives double-encoded (a JSON string inside the entry
 * JSON) and is parsed to an object; unparsable values stay raw strings.
 */
export function zipObservationToolCalls(
  observation: Pick<ObservationForEval, "tool_calls" | "tool_call_names">,
): ToolCallForEval[] {
  return observation.tool_call_names.map((name, i) => {
    const parsed = parseJsonIfString(observation.tool_calls[i]);
    const entry =
      typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};

    return {
      id: typeof entry.id === "string" ? entry.id : "",
      name,
      arguments: parseJsonIfString(entry.arguments) ?? {},
      type: typeof entry.type === "string" ? entry.type : "",
      index: typeof entry.index === "number" ? entry.index : 0,
    };
  });
}

export function convertEventRecordToObservationForEval(
  record: EventRecordBaseType,
): ObservationForEval {
  const metadata = metadataArraysToRecord(
    record.metadata_names,
    record.metadata_values,
  );
  const experimentItemMetadata =
    record.experiment_item_metadata_names.length > 0
      ? record.experiment_item_metadata_names.reduce<
          Record<string, string | null | undefined>
        >((acc, name, i) => {
          if (!(name in acc)) {
            acc[name] = record.experiment_item_metadata_values[i];
          }
          return acc;
        }, {})
      : undefined;

  const toolCallNames = record.tool_call_names ?? [];
  return observationForEvalSchema.parse({
    ...record,
    metadata,
    experiment_item_metadata: experimentItemMetadata,
    tool_call_count: toolCallNames.length,
  });
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
    | "parent_span_id"
    | "tool_call_names"
    | "tool_call_count"
  >;

export type ObservationEvalMappingColumnInternal = keyof Pick<
  ObservationForEval,
  | "input"
  | "output"
  | "metadata"
  | "tool_calls"
  | "experiment_item_expected_output"
  | "experiment_item_metadata"
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
 * Canonical variable set for code evaluators — one entry per experiment
 * target column below (the id annotation on the column arrays pins them to
 * this list). Web synthesizes rule mappings from it
 * (getCodeEvalVariableMapping) and buildCodeEvalPayload (codeEvalExecution)
 * places each variable in the evaluator payload — see the
 * CODE_EVAL_PAYLOAD_SECTION_BY_VARIABLE tripwire in codeEvalDispatcherTypes.
 */
export const CODE_EVAL_TEMPLATE_VARIABLES = [
  "input",
  "output",
  "metadata",
  "toolCalls",
  "experimentItemExpectedOutput",
  "experimentItemMetadata",
] as const;

export type CodeEvalTemplateVariable =
  (typeof CODE_EVAL_TEMPLATE_VARIABLES)[number];

export const eventTargetEvalVariableColumns: (ObservationEvalVariableColumn & {
  id: CodeEvalTemplateVariable;
})[] = [
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
    id: "toolCalls",
    name: "Tool Calls",
    description:
      "Tool calls recorded on the observation ({id, name, arguments, type, index})",
    internal: "tool_calls",
  },
];

export const experimentTargetEvalVariableColumns: (ObservationEvalVariableColumn & {
  id: CodeEvalTemplateVariable;
})[] = [
  ...eventTargetEvalVariableColumns,
  {
    id: "experimentItemExpectedOutput",
    name: "Expected Output",
    description: "Expected output from experiment item",
    internal: "experiment_item_expected_output",
  },
  {
    id: "experimentItemMetadata",
    name: "Experiment Item Metadata",
    description: "Metadata from experiment item",
    type: "stringObject",
    internal: "experiment_item_metadata",
  },
];

/**
 * Columns available for variable extraction in observation-based evals.
 * These are the fields that can be mapped to template variables.
 *
 * When configuring an eval, users can map these columns to template
 * variables like {{input}}, {{output}}, {{expected_output}}, etc.
 */
export const observationEvalVariableColumns: ObservationEvalVariableColumn[] = [
  ...experimentTargetEvalVariableColumns,
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
  {
    name: "Parent Observation",
    id: "parentObservationId",
    type: "null",
    internal: "parent_span_id",
    nullable: true,
  },
  {
    name: "Called Tool Names",
    id: "calledToolNames",
    type: "arrayOptions",
    internal: "tool_call_names",
    options: [], // to be filled at runtime
  },
  {
    name: "Tool Call Count",
    id: "toolCalls",
    type: "number",
    internal: "tool_call_count",
    step: 1,
    min: 0,
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
  calledToolNames?: Array<SingleValueOption>;
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
    if (col.id === "calledToolNames") {
      return formatColumnOptions(col, options?.calledToolNames ?? []);
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
