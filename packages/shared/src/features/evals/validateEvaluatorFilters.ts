import { z } from "zod";
import { singleFilter } from "../../interfaces/filters";
import type { ColumnDefinition } from "../../tableDefinitions";
import {
  evalDatasetFormFilterCols,
  evalTraceTableCols,
} from "../../tableDefinitions/tracesTable";
import type { FilterCondition, FilterState } from "../../types";
import {
  experimentEvalFilterColumns,
  observationEvalFilterColumns,
} from "./observationForEval";
import { COMPATIBLE_FILTER_TYPES } from "../../server/queries/clickhouse-sql/filterTypeCompatibility";
import {
  EvalTargetObject,
  type EvalTargetObject as EvalTargetObjectType,
} from "./types";

export type EvaluatorFilterValidationIssueCode =
  | "invalid_filter_shape"
  | "unsupported_column"
  | "incompatible_filter_type";

export type EvaluatorFilterValidationIssue = {
  code: EvaluatorFilterValidationIssueCode;
  message: string;
  index: number | null;
  column: string | null;
  filterType: FilterCondition["type"] | null;
  expectedColumnType?: ColumnDefinition["type"];
};

export type EvaluatorFilterValidationResult = {
  isValid: boolean;
  validatedFilters: FilterState;
  issues: EvaluatorFilterValidationIssue[];
};

const parsedFilterSchema = z.array(singleFilter).nullable();

const getSupportedColumnsForTarget = (
  targetObject: EvalTargetObjectType,
): ColumnDefinition[] => {
  switch (targetObject) {
    case EvalTargetObject.TRACE:
      return evalTraceTableCols;
    case EvalTargetObject.DATASET:
      return evalDatasetFormFilterCols;
    case EvalTargetObject.EVENT:
      return observationEvalFilterColumns;
    case EvalTargetObject.EXPERIMENT:
      return experimentEvalFilterColumns;
  }
};

const findMatchingColumnDefinition = (
  filterColumn: string,
  columns: ColumnDefinition[],
): ColumnDefinition | undefined =>
  columns.find(
    (column) =>
      column.id === filterColumn ||
      column.name === filterColumn ||
      column.aliases?.includes(filterColumn),
  );

export function validateEvaluatorFiltersForTarget(params: {
  targetObject: EvalTargetObjectType;
  filter: unknown;
}): EvaluatorFilterValidationResult {
  const columns = getSupportedColumnsForTarget(params.targetObject);
  const parsedFilter = parsedFilterSchema.safeParse(params.filter);

  if (!parsedFilter.success) {
    return {
      isValid: false,
      validatedFilters: [],
      issues: [
        {
          code: "invalid_filter_shape",
          message:
            "Evaluator filters are invalid. Remove unsupported or incomplete filters and try again.",
          index: null,
          column: null,
          filterType: null,
        },
      ],
    };
  }

  const filters = parsedFilter.data ?? [];

  const issues: EvaluatorFilterValidationIssue[] = filters.flatMap(
    (filter, index): EvaluatorFilterValidationIssue[] => {
      const column = findMatchingColumnDefinition(filter.column, columns);

      if (!column) {
        return [
          {
            code: "unsupported_column" as const,
            message: `Filter column "${filter.column}" is not supported for target "${params.targetObject}".`,
            index,
            column: filter.column,
            filterType: filter.type,
          },
        ];
      }

      if (filter.type === "null") {
        return [];
      }

      const compatibleFilterTypes = COMPATIBLE_FILTER_TYPES[column.type];

      if (
        compatibleFilterTypes &&
        compatibleFilterTypes.includes(filter.type)
      ) {
        return [];
      }

      return [
        {
          code: "incompatible_filter_type" as const,
          message: `Filter type "${filter.type}" is not supported for column "${column.name}".`,
          index,
          column: filter.column,
          filterType: filter.type,
          expectedColumnType: column.type,
        },
      ];
    },
  );

  return {
    isValid: issues.length === 0,
    validatedFilters: filters,
    issues,
  };
}
