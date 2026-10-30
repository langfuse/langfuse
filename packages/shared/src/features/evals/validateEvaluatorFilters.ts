import { singleFilterList } from "../../interfaces/filters";
import type { ColumnDefinition } from "../../tableDefinitions";
import {
  evalDatasetFormFilterCols,
  evalTraceTableCols,
} from "../../tableDefinitions/tracesTable";
import type { FilterCondition, FilterState } from "../../types";
import type { EvalFilterDefinition } from "./filterFields";
import { eventsEvalFilterColumns } from "./spanFilters";
import { experimentEvalFilterColumns } from "./experimentFilters";
import { traceTranscriptFilterDefinition } from "./traceTranscriptFilters";
import { COMPATIBLE_FILTER_TYPES } from "../../server/queries/clickhouse-sql/filterTypeCompatibility";
import {
  EvalTargetObject,
  TopicsTargetObject,
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

const parsedFilterSchema = singleFilterList.nullable();

const getFilterDefinitionForTarget = (
  targetObject: EvalTargetObjectType | typeof TopicsTargetObject,
): EvalFilterDefinition => {
  switch (targetObject) {
    case EvalTargetObject.TRACE:
      return { columns: evalTraceTableCols };
    case EvalTargetObject.DATASET:
      return { columns: evalDatasetFormFilterCols };
    case TopicsTargetObject:
      return traceTranscriptFilterDefinition;
    case EvalTargetObject.EVENT:
      return { columns: eventsEvalFilterColumns };
    case EvalTargetObject.EXPERIMENT:
      return { columns: experimentEvalFilterColumns };
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
  targetObject: EvalTargetObjectType | typeof TopicsTargetObject;
  filter: unknown;
}): EvaluatorFilterValidationResult {
  const definition = getFilterDefinitionForTarget(params.targetObject);
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
      const column = findMatchingColumnDefinition(
        filter.column,
        definition.columns,
      );

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

      if (
        definition.operators &&
        !definition.operators[filter.type]?.includes(filter.operator)
      ) {
        return [
          {
            code: "invalid_filter_shape",
            message: `Filter operator "${filter.operator}" is not supported for target "${params.targetObject}".`,
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
