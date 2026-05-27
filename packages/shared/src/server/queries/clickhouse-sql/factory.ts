import { FTS_MATCH_OPERATOR } from "../../../interfaces/filters";
import { type EventsTableFilterState } from "../../../types";
import { InvalidRequestError } from "../../../errors";
import { isValidTableName } from "../../clickhouse/schemaUtils";
import { logger } from "../../logger";
import {
  findUiColumnMapping,
  type ColumnDefinition,
  type UiColumnMappings,
} from "../../../tableDefinitions";
import { COMPATIBLE_FILTER_TYPES } from "./filterTypeCompatibility";
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
import {
  assertValidFtsMatchFilter,
  isFtsEventsTable,
  isFtsTextField,
} from "./fts";

const EVENTS_IO_FILTER_TYPE_ERROR =
  "Input/output filters only support filter type `string`.";

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
  filter: EventsTableFilterState,
  columnMapping: UiColumnMappings,
  columnDefinitions?: ColumnDefinition[],
) => {
  const applicableFilters = filter.filter(
    (frontEndFilter) => frontEndFilter.type !== "positionInTrace",
  );

  return applicableFilters.map((frontEndFilter) => {
    // checks if the column exists in the clickhouse schema
    const column = matchAndVerifyTracesUiColumn(frontEndFilter, columnMapping);

    validateEventsTableIoFilterType(frontEndFilter, column);

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

    validateEventsTableMatchesFilter(frontEndFilter, column);

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
      default:
        // eslint-disable-next-line no-case-declarations
        const exhaustiveCheck: never = frontEndFilter;
        logger.error(`Invalid filter type: ${JSON.stringify(exhaustiveCheck)}`);
        throw new QueryBuilderError(`Invalid filter type`);
    }
  });
};

const validateEventsTableMatchesFilter = (
  filter: EventsTableFilterState[number],
  column: UiColumnMappings[number],
) => {
  if (!("operator" in filter) || filter.operator !== FTS_MATCH_OPERATOR) {
    return;
  }

  if (filter.type === "string") {
    assertValidFtsMatchFilter({
      filterType: "string",
      clickhouseTable: column.clickhouseTableName,
      field: column.clickhouseSelect,
      value: filter.value,
    });
    return;
  } else if (filter.type === "stringObject") {
    assertValidFtsMatchFilter({
      filterType: "stringObject",
      clickhouseTable: column.clickhouseTableName,
      field: column.clickhouseSelect,
      value: filter.value,
    });
    return;
  }

  throw new QueryBuilderError(`Invalid filter type`);
};

const validateEventsTableIoFilterType = (
  filter: EventsTableFilterState[number],
  column: UiColumnMappings[number],
) => {
  if (
    isFtsEventsTable(column.clickhouseTableName) &&
    isFtsTextField(column.clickhouseSelect) &&
    filter.type !== "string"
  ) {
    throw new InvalidRequestError(EVENTS_IO_FILTER_TYPE_ERROR);
  }
};

const matchAndVerifyTracesUiColumn = (
  filter: EventsTableFilterState[number],
  uiTableDefinitions: UiColumnMappings,
) => {
  // tries to match the column name to the clickhouse table name
  const uiTable = findUiColumnMapping(uiTableDefinitions, filter.column);

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
