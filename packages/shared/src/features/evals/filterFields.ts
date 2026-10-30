import { ObservationLevel, ObservationType } from "../../domain";
import { isRootObservation } from "../../eventsTable";
import type { ColumnDefinition } from "../../tableDefinitions";
import type { FilterCondition } from "../../types";
import type { ObservationForEval } from "./observationForEval";

export type EvalFilterDefinition = {
  columns: ColumnDefinition[];
  /** When supplied, omitted filter types and operators are unsupported. */
  operators?: Partial<
    Record<FilterCondition["type"], readonly FilterCondition["operator"][]>
  >;
};

export type ObservationEvalFilterColumnInternal =
  /** Column identifier (must match an ObservationForEval field name) */
  keyof Pick<
    ObservationForEval,
    | "type"
    | "name"
    | "environment"
    | "level"
    | "status_message"
    | "version"
    | "release"
    | "trace_name"
    | "user_id"
    | "session_id"
    | "provided_model_name"
    | "prompt_name"
    | "prompt_version"
    | "tags"
    | "experiment_id"
    | "experiment_name"
    | "experiment_dataset_id"
    | "experiment_item_root_span_id"
    | "metadata"
    | "parent_span_id"
    | "is_app_root"
    | "tool_call_names"
    | "tool_call_count"
  >;

export type ObservationEvalColumnDef = ColumnDefinition & {
  internal: ObservationEvalFilterColumnInternal;
};

export const evalFilterFields = {
  type: {
    name: "Type",
    id: "type",
    type: "stringOptions",
    internal: "type",
    options: Object.values(ObservationType).map((key) => ({ value: key })),
  },
  name: {
    name: "Name",
    id: "name",
    type: "stringOptions",
    internal: "name",
    options: [], // to be filled at runtime
  },
  environment: {
    name: "Environment",
    id: "environment",
    type: "stringOptions",
    internal: "environment",
    options: [], // to be filled at runtime
  },
  level: {
    name: "Status",
    id: "level",
    type: "stringOptions",
    internal: "level",
    options: Object.values(ObservationLevel).map((key) => ({ value: key })),
    aliases: ["Level"],
  },
  version: {
    name: "Version",
    id: "version",
    type: "string",
    internal: "version",
    nullable: true,
  },
  release: {
    name: "Release",
    id: "release",
    type: "string",
    internal: "release",
    nullable: true,
  },
  statusMessage: {
    name: "Status Message",
    id: "statusMessage",
    type: "string",
    internal: "status_message",
    nullable: true,
  },
  providedModelName: {
    name: "Provided Model Name",
    id: "providedModelName",
    type: "string",
    internal: "provided_model_name",
    nullable: true,
  },
  promptName: {
    name: "Prompt Name",
    id: "promptName",
    type: "string",
    internal: "prompt_name",
    nullable: true,
  },
  promptVersion: {
    name: "Prompt Version",
    id: "promptVersion",
    type: "number",
    internal: "prompt_version",
    nullable: true,
  },
  traceName: {
    name: "Trace Name",
    id: "traceName",
    type: "stringOptions",
    internal: "trace_name",
    options: [], // to be filled at runtime
    nullable: true,
  },
  userId: {
    name: "User ID",
    id: "userId",
    type: "string",
    internal: "user_id",
    nullable: true,
  },
  sessionId: {
    name: "Session ID",
    id: "sessionId",
    type: "string",
    internal: "session_id",
    nullable: true,
  },
  tags: {
    name: "Tags",
    id: "tags",
    type: "arrayOptions",
    internal: "tags",
    options: [], // to be filled at runtime
  },
  metadata: {
    name: "Metadata",
    id: "metadata",
    type: "stringObject",
    internal: "metadata",
  },
  isRootObservation: {
    name: "Is Root Observation",
    id: "isRootObservation",
    type: "boolean",
    internal: "is_app_root",
  },
  parentObservationId: {
    name: "Parent Observation",
    id: "parentObservationId",
    type: "null",
    internal: "parent_span_id",
    nullable: true,
  },
  experimentId: {
    name: "Experiment ID",
    id: "experimentId",
    type: "stringOptions",
    internal: "experiment_id",
    options: [], // to be filled at runtime
    nullable: true,
  },
  experimentName: {
    name: "Experiment Name",
    id: "experimentName",
    type: "string",
    internal: "experiment_name",
    nullable: true,
  },
  isExperimentItemRootSpan: {
    name: "Is Experiment Item Root Span",
    id: "isExperimentItemRootSpan",
    type: "boolean",
    internal: "experiment_item_root_span_id",
  },
  calledToolNames: {
    name: "Called Tool Names",
    id: "calledToolNames",
    type: "arrayOptions",
    internal: "tool_call_names",
    options: [], // to be filled at runtime
  },
  toolCalls: {
    name: "Tool Call Count",
    id: "toolCalls",
    type: "number",
    internal: "tool_call_count",
    step: 1,
    min: 0,
  },
  experimentDatasetId: {
    name: "Dataset",
    id: "experimentDatasetId",
    type: "stringOptions",
    internal: "experiment_dataset_id",
    options: [], // to be filled at runtime
  },
} satisfies Record<string, ObservationEvalColumnDef>;

const evalFilterFieldsById = new Map<string, ObservationEvalColumnDef>(
  Object.values(evalFilterFields).map((column) => [column.id, column]),
);

/**
 * Field mapper for observation eval filters.
 * Maps camelCase filter column IDs to snake_case observation fields.
 * Uses the shared field definitions independently of each target's filter list.
 *
 * @param observation - The observation data object
 * @param column - The camelCase column ID from filter definitions
 * @returns The value from the observation object
 */
export function mapEventEvalFilterColumnIdToField(
  observation: ObservationForEval,
  column: string,
) {
  const columnMapping = evalFilterFieldsById.get(column);
  if (!columnMapping) {
    return undefined;
  }

  if (columnMapping.id === "isRootObservation") {
    return isRootObservation({
      parentObservationId: observation.parent_span_id,
      isAppRoot: observation.is_app_root,
    });
  }

  if (columnMapping.id === "isExperimentItemRootSpan") {
    return (
      observation.experiment_item_root_span_id !== null &&
      observation.experiment_item_root_span_id === observation.span_id
    );
  }

  return observation[columnMapping.internal];
}
