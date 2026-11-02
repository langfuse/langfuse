import type {
  ColumnDefinition,
  SingleValueOption,
} from "../../tableDefinitions";
import { formatColumnOptions } from "../../tableDefinitions/typeHelpers";
import {
  evalFilterFields,
  type ObservationEvalColumnDef,
} from "./filterFields";

export const experimentEvalFilterColumns: ObservationEvalColumnDef[] = [
  evalFilterFields.experimentDatasetId,
];

export type ExperimentEvalOptions = {
  experimentDatasetId?: Array<SingleValueOption>;
};

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
