import z from "zod/v4";
import { singleFilter } from "../../../interfaces/filters";
import { FilterCondition } from "../../../types";
import { isValidTableName } from "../../clickhouse/schemaUtils";
import { logger } from "../../logger";
import { UiColumnMappings } from "../../../tableDefinitions";
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
} from "./clickhouse-filter";

export class QueryBuilderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueryBuilderError";
  }
}

// This function ensures that the user only selects valid columns from the clickhouse schema.
// The filter property in this column needs to be zod verified.
// User input for values (e.g. project_id = <value>) are sent to Clickhouse as parameters to prevent SQL injection
export const createFilterFromFilterState = (
  filter: FilterCondition[],
  columnMapping: UiColumnMappings,
) => {
  const applicableFilters = filter.filter(
    (frontEndFilter) => frontEndFilter.type !== "positionInTrace",
  );

  return applicableFilters.map((frontEndFilter) => {
    // checks if the column exists in the clickhouse schema
    const column = matchAndVerifyTracesUiColumn(frontEndFilter, columnMapping);

    switch (frontEndFilter.type) {
      case "string":
        return new StringFilter({
          clickhouseTable: column.clickhouseTableName,
          field: column.clickhouseSelect,
          operator: frontEndFilter.operator,
          value: frontEndFilter.value,
          tablePrefix: column.queryPrefix,
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
        // Events_* table uses empty string instead of NULL for parent_span_id
        if (
          frontEndFilter.column === "parentObservationId" &&
          column.clickhouseTableName.startsWith("events")
        ) {
          const isNull = frontEndFilter.operator === "is null";
          const fieldWithPrefix = column.queryPrefix
            ? `${column.queryPrefix}.${column.clickhouseSelect}`
            : column.clickhouseSelect;

          // Create an inline filter for empty string comparison
          return {
            clickhouseTable: column.clickhouseTableName,
            field: column.clickhouseSelect,
            operator: isNull ? ("=" as const) : ("!=" as const),
            tablePrefix: column.queryPrefix,
            apply: () => ({
              query: `${fieldWithPrefix} ${isNull ? "=" : "!="} ''`,
              params: {},
            }),
          };
        }

        return new NullFilter({
          clickhouseTable: column.clickhouseTableName,
          field: column.clickhouseSelect,
          operator: frontEndFilter.operator,
          tablePrefix: column.queryPrefix,
        });
      default:
        // eslint-disable-next-line no-case-declarations
        const exhaustiveCheck: never = frontEndFilter;
        logger.error(`Invalid filter type: ${JSON.stringify(exhaustiveCheck)}`);
        throw new QueryBuilderError(`Invalid filter type`);
    }
  });
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
    throw new QueryBuilderError(errorMessage);
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
