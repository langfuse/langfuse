import type {
  ColumnDefinition,
  SingleValueOption,
} from "../../tableDefinitions";
import { formatColumnOptions } from "../../tableDefinitions/typeHelpers";
import {
  evalFilterFields,
  type ObservationEvalColumnDef,
} from "./filterFields";
import { experimentEvalFilterColumns } from "./experimentFilters";

export const observationEvalFilterColumns: ObservationEvalColumnDef[] = [
  evalFilterFields.type,
  evalFilterFields.name,
  evalFilterFields.environment,
  evalFilterFields.level,
  evalFilterFields.version,
  evalFilterFields.release,
  evalFilterFields.statusMessage,
  evalFilterFields.providedModelName,
  evalFilterFields.promptName,
  evalFilterFields.promptVersion,
  evalFilterFields.traceName,
  evalFilterFields.userId,
  evalFilterFields.sessionId,
  evalFilterFields.tags,
  evalFilterFields.metadata,
  evalFilterFields.isRootObservation,
  evalFilterFields.parentObservationId,
  evalFilterFields.experimentId,
  evalFilterFields.experimentName,
  evalFilterFields.isExperimentItemRootSpan,
  evalFilterFields.calledToolNames,
  evalFilterFields.toolCalls,
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
