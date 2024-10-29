import z from "zod";
import { singleFilter } from "../../../interfaces/filters";
import { tracesTableUiColumnDefinitions } from "../../../tableDefinitions/mapTracesTable";
import { FilterCondition } from "../../../types";
import {
  ObservationClickhouseColumns,
  TraceClickhouseColumns,
} from "../../clickhouse/schema";
import {
  isKeyOfClickhouseRecord,
  isValidTableName,
} from "../../clickhouse/schema-utils";
import { logger } from "../../logger";
import { UiColumnMapping } from "../../../tableDefinitions";
import {
  StringFilter,
  DateTimeFilter,
  StringOptionsFilter,
  FilterList,
  NumberFilter,
  ArrayOptionsFilter,
  BooleanFilter,
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
  opts?: {
    tracesPrefix?: string;
    observationsPrefix?: string;
    scoresPrefix?: string;
  },
) => {
  return filter.map((frontEndFilter) => {
    // checks if the column exists in the clickhouse schema
    const { col, table } = matchAndVerifyTracesUiColumn(
      frontEndFilter,
      tracesTableUiColumnDefinitions,
    );

    const prefix =
      table === "observations" ? opts?.observationsPrefix : opts?.tracesPrefix;

    switch (frontEndFilter.type) {
      case "string":
        return new StringFilter({
          clickhouseTable: table,
          field: col.clickhouse_mapping,
          operator: frontEndFilter.operator,
          value: frontEndFilter.value,
          tablePrefix: prefix,
        });
      case "datetime":
        return new DateTimeFilter({
          clickhouseTable: table,
          field: col.clickhouse_mapping,
          operator: frontEndFilter.operator,
          value: frontEndFilter.value,
          tablePrefix: prefix,
        });
      case "stringOptions":
        return new StringOptionsFilter({
          clickhouseTable: table,
          field: col.clickhouse_mapping,
          operator: frontEndFilter.operator,
          values: frontEndFilter.value,
          tablePrefix: prefix,
        });
      case "number":
        return new NumberFilter({
          clickhouseTable: table,
          field: col.clickhouse_mapping,
          operator: frontEndFilter.operator,
          value: frontEndFilter.value,
          tablePrefix: prefix,
        });
      case "arrayOptions":
        return new ArrayOptionsFilter({
          clickhouseTable: table,
          field: col.clickhouse_mapping,
          operator: frontEndFilter.operator,
          values: frontEndFilter.value,
          tablePrefix: prefix,
        });
      case "boolean":
        return new BooleanFilter({
          clickhouseTable: table,
          field: col.clickhouse_mapping,
          value: frontEndFilter.value,
          tablePrefix: prefix,
        });
      default:
        throw new QueryBuilderError(
          `Invalid filter type: ${frontEndFilter.type}`,
        );
    }
  });
};

const matchAndVerifyTracesUiColumn = (
  filter: z.infer<typeof singleFilter>,
  uiTableDefinitions: UiColumnMapping[],
) => {
  // tries to match the column name to the clickhouse table name
  logger.debug(`Filter to match: ${JSON.stringify(filter)}`);

  const uiTable = uiTableDefinitions.find(
    (col) => col.uiTableName === filter.column, // matches on the NAME of the column in the UI.
  );

  if (!uiTable) {
    throw new QueryBuilderError(
      `Column ${filter.column} does not match a UI / CH table mapping.`,
    );
  }

  if (!isValidTableName(uiTable.clickhouseTableName)) {
    throw new QueryBuilderError(
      `Invalid clickhouse table name: ${uiTable.clickhouseTableName}`,
    );
  }

  if (
    !isKeyOfClickhouseRecord(
      uiTable.clickhouseTableName,
      uiTable.clickhouseColumnName,
    )
  ) {
    throw new QueryBuilderError(
      `Column ${uiTable.clickhouseColumnName} does not exist in table ${JSON.stringify(uiTable)}.`,
    );
  }

  if (uiTable.clickhouseTableName === "traces") {
    const column = TraceClickhouseColumns.find(
      (col) => col.name === uiTable.clickhouseColumnName,
    );
    if (!column) {
      throw new QueryBuilderError(
        `Column ${uiTable.clickhouseColumnName} does not exist in traces table.`,
      );
    }
    return {
      col: column,
      table: uiTable.clickhouseTableName,
    };
  } else if (uiTable.clickhouseTableName === "observations") {
    const column = ObservationClickhouseColumns.find(
      (col) => col.name === uiTable.clickhouseColumnName,
    );
    if (!column) {
      throw new QueryBuilderError(
        `Column ${uiTable.clickhouseColumnName} does not exist in observations table.`,
      );
    }
    return {
      col: column,
      table: uiTable.clickhouseTableName,
    };
  }
  throw new QueryBuilderError(
    `Unhandled table case: ${uiTable.clickhouseTableName}`,
  );
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
