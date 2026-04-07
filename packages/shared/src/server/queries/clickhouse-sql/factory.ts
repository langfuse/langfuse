import z from "zod";
import {
  normalizeFilterExpressionInput,
  singleFilter,
} from "../../../interfaces/filters";
import { FilterCondition, FilterExpression, FilterInput } from "../../../types";
import { InvalidRequestError } from "../../../errors";
import { isValidTableName } from "../../clickhouse/schemaUtils";
import { logger } from "../../logger";
import {
  type ColumnDefinition,
  type UiColumnMappings,
} from "../../../tableDefinitions";
import {
  StringFilter,
  DateTimeFilter,
  StringOptionsFilter,
  CategoryOptionsFilter,
  FilterList,
  NumberFilter,
  ArrayOptionsFilter,
  BooleanFilter,
  NumberObjectFilter,
  StringObjectFilter,
  NullFilter,
  FilterTree,
  type Filter,
} from "./clickhouse-filter";

export class QueryBuilderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueryBuilderError";
  }
}

// Maps each ColumnDefinition.type to the filter types that are structurally compatible
// at the ClickHouse level. string/stringOptions both operate on String columns,
// and stringOptions "any of" works on Array columns too.
const COMPATIBLE_FILTER_TYPES: Record<string, string[]> = {
  string: ["string", "stringOptions"],
  stringOptions: ["string", "stringOptions"],
  arrayOptions: ["arrayOptions", "stringOptions"],
  datetime: ["datetime"],
  number: ["number"],
  boolean: ["boolean"],
  stringObject: ["stringObject"],
  numberObject: ["numberObject"],
  categoryOptions: ["categoryOptions", "stringOptions"],
};

// This function ensures that the user only selects valid columns from the clickhouse schema.
// The filter property in this column needs to be zod verified.
// User input for values (e.g. project_id = <value>) are sent to Clickhouse as parameters to prevent SQL injection
const createFilterFromCondition = (
  frontEndFilter: FilterCondition,
  columnMapping: UiColumnMappings,
  columnDefinitions?: ColumnDefinition[],
): Filter => {
  // checks if the column exists in the clickhouse schema
  const column = matchAndVerifyTracesUiColumn(frontEndFilter, columnMapping);

  if (columnDefinitions && frontEndFilter.type !== "null") {
    const colDef = columnDefinitions.find((c) => c.id === column.uiTableId);
    if (colDef) {
      const compatible = COMPATIBLE_FILTER_TYPES[colDef.type];
      if (compatible && !compatible.includes(frontEndFilter.type)) {
        throw new InvalidRequestError(
          `Invalid filter type '${frontEndFilter.type}' for column '${frontEndFilter.column}'. Expected filter type '${colDef.type}'.`,
        );
      }
    }
  }

  switch (frontEndFilter.type) {
    case "string":
      return new StringFilter({
        clickhouseTable: column.clickhouseTableName,
        field: column.clickhouseSelect,
        operator: frontEndFilter.operator,
        value: frontEndFilter.value,
        tablePrefix: column.queryPrefix,
        emptyEqualsNull: column.emptyEqualsNull,
      });
    case "datetime":
      return new DateTimeFilter({
        clickhouseTable: column.clickhouseTableName,
        field: column.clickhouseSelect,
        operator: frontEndFilter.operator,
        value: frontEndFilter.value,
        tablePrefix: column.queryPrefix,
      });
    case "stringOptions":
      return new StringOptionsFilter({
        clickhouseTable: column.clickhouseTableName,
        field: column.clickhouseSelect,
        operator: frontEndFilter.operator,
        values: frontEndFilter.value,
        tablePrefix: column.queryPrefix,
        emptyEqualsNull: column.emptyEqualsNull,
      });
    case "categoryOptions":
      return new CategoryOptionsFilter({
        clickhouseTable: column.clickhouseTableName,
        field: column.clickhouseSelect,
        operator: frontEndFilter.operator,
        key: frontEndFilter.key,
        values: frontEndFilter.value,
        tablePrefix: column.queryPrefix,
      });
    case "number":
      return new NumberFilter({
        clickhouseTable: column.clickhouseTableName,
        field: column.clickhouseSelect,
        operator: frontEndFilter.operator,
        value: frontEndFilter.value,
        tablePrefix: column.queryPrefix,
        clickhouseTypeOverwrite: column.clickhouseTypeOverwrite,
      });
    case "arrayOptions":
      return new ArrayOptionsFilter({
        clickhouseTable: column.clickhouseTableName,
        field: column.clickhouseSelect,
        operator: frontEndFilter.operator,
        values: frontEndFilter.value,
        tablePrefix: column.queryPrefix,
      });
    case "boolean":
      return new BooleanFilter({
        clickhouseTable: column.clickhouseTableName,
        field: column.clickhouseSelect,
        value: frontEndFilter.value,
        operator: frontEndFilter.operator,
        tablePrefix: column.queryPrefix,
      });
    case "numberObject":
      return new NumberObjectFilter({
        clickhouseTable: column.clickhouseTableName,
        field: column.clickhouseSelect,
        key: frontEndFilter.key,
        operator: frontEndFilter.operator,
        value: frontEndFilter.value,
        tablePrefix: column.queryPrefix,
      });
    case "stringObject":
      return new StringObjectFilter({
        clickhouseTable: column.clickhouseTableName,
        field: column.clickhouseSelect,
        operator: frontEndFilter.operator,
        key: frontEndFilter.key,
        value: frontEndFilter.value,
        tablePrefix: column.queryPrefix,
      });
    case "null":
      return new NullFilter({
        clickhouseTable: column.clickhouseTableName,
        field: column.clickhouseSelect,
        operator: frontEndFilter.operator,
        tablePrefix: column.queryPrefix,
        emptyEqualsNull: column.emptyEqualsNull,
      });
    case "positionInTrace":
      throw new QueryBuilderError(
        "positionInTrace filters must be handled before ClickHouse filter compilation",
      );
    default:
      // eslint-disable-next-line no-case-declarations
      const exhaustiveCheck: never = frontEndFilter;
      logger.error(`Invalid filter type: ${JSON.stringify(exhaustiveCheck)}`);
      throw new QueryBuilderError(`Invalid filter type`);
  }
};

export const createFilterFromFilterState = (
  filter: FilterCondition[],
  columnMapping: UiColumnMappings,
  columnDefinitions?: ColumnDefinition[],
) => {
  const applicableFilters = filter.filter(
    (frontEndFilter) => frontEndFilter.type !== "positionInTrace",
  );

  return applicableFilters.map((frontEndFilter) =>
    createFilterFromCondition(frontEndFilter, columnMapping, columnDefinitions),
  );
};

export const createFilterTreeFromFilterExpression = (
  filterExpression: FilterExpression | undefined,
  columnMapping: UiColumnMappings,
  columnDefinitions?: ColumnDefinition[],
): FilterTree => {
  if (!filterExpression) {
    return new FilterTree();
  }

  if (filterExpression.type === "group") {
    return FilterTree.fromGroup(
      filterExpression.operator,
      filterExpression.conditions.map((condition) =>
        createFilterTreeFromFilterExpression(
          condition,
          columnMapping,
          columnDefinitions,
        ),
      ),
    );
  }

  if (filterExpression.type === "positionInTrace") {
    return new FilterTree();
  }

  return FilterTree.fromFilter(
    createFilterFromCondition(
      filterExpression,
      columnMapping,
      columnDefinitions,
    ),
  );
};

export const createFilterTreeFromFilterInput = (
  filterInputValue: FilterInput | undefined,
  columnMapping: UiColumnMappings,
  columnDefinitions?: ColumnDefinition[],
): FilterTree => {
  return createFilterTreeFromFilterExpression(
    normalizeFilterExpressionInput(filterInputValue),
    columnMapping,
    columnDefinitions,
  );
};

const matchAndVerifyTracesUiColumn = (
  filter: z.infer<typeof singleFilter>,
  uiTableDefinitions: UiColumnMappings,
) => {
  // tries to match the column name to the clickhouse table name
  const uiTable = uiTableDefinitions.find(
    (col) =>
      col.uiTableName === filter.column || col.uiTableId === filter.column, // matches on the NAME of the column in the UI.
  );

  if (!uiTable) {
    const errorMessage = `Column ${filter.column} does not match a UI / CH table mapping.`;
    logger.error(errorMessage, {
      filterColumn: filter.column,
      filterType: filter.type,
      availableColumns: uiTableDefinitions.map(
        (col) => col.uiTableId ?? col.uiTableName,
      ),
    });
    throw new InvalidRequestError(errorMessage);
  }

  if (!isValidTableName(uiTable.clickhouseTableName)) {
    throw new QueryBuilderError(
      `Invalid clickhouse table name: ${uiTable.clickhouseTableName}`,
    );
  }

  return uiTable;
};

export function getProjectIdDefaultFilter(
  projectId: string,
  opts: { tracesPrefix: string },
): {
  tracesFilter: FilterList;
  scoresFilter: FilterList;
  observationsFilter: FilterList;
} {
  return {
    tracesFilter: new FilterList([
      new StringFilter({
        clickhouseTable: "traces",
        field: "project_id",
        operator: "=",
        value: projectId,
        tablePrefix: opts.tracesPrefix,
      }),
    ]),
    scoresFilter: new FilterList([
      new StringFilter({
        clickhouseTable: "scores",
        field: "project_id",
        operator: "=",
        value: projectId,
      }),
    ]),
    observationsFilter: new FilterList([
      new StringFilter({
        clickhouseTable: "observations",
        field: "project_id",
        operator: "=",
        value: projectId,
      }),
    ]),
  };
}
