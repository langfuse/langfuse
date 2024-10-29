import z from "zod";
import { singleFilter } from "../../../interfaces/filters";
import {
  tracesTableUiColumnDefinitions,
  UiColumnMapping,
} from "../../../tableDefinitions/frontend-table-definitions";
import { FilterCondition } from "../../../types";
import {
  ClickhouseTableNames,
  isKeyOfClickhouseRecord,
  isValidTableName,
  ObservationClickhouseColumns,
  TraceClickhouseColumns,
} from "../../clickhouse/schema";
import { isColumnOnSchema } from "../../clickhouse/schema-helpers";
import { logger } from "../../logger";

export class QueryBuilderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueryBuilderError";
  }
}

export interface Filter {
  toClickhouseQuery(): ClickhouseFilter;
  apply(): ClickhouseFilter;
  verify(): void;
  clickhouseTable: string;
}

type ClickhouseFilter = {
  query: string;
  params: { [x: string]: string | number };
};

export class StringFilter implements Filter {
  public clickhouseTable: string;
  protected field: string;
  protected value: string;
  protected operator: string;
  protected tablePrefix?: string;

  constructor(opts: {
    clickhouseTable: string;
    field: string;
    operator: string;
    value: string;
    tablePrefix?: string;
  }) {
    this.clickhouseTable = opts.clickhouseTable;
    this.field = opts.field;
    this.value = opts.value;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
  }

  verify() {
    if (!(this.clickhouseTable in ClickhouseTableNames)) {
      throw new QueryBuilderError(
        `Table ${this.clickhouseTable} does not exist in Clickhouse schema.`
      );
    }

    if (!isColumnOnSchema(this.clickhouseTable, this.field)) {
      throw new QueryBuilderError(
        `Column ${this.field} does not exist in table ${this.clickhouseTable}.`
      );
    }

    if (this.operator !== "=" && this.operator !== "!=") {
      throw new QueryBuilderError(`Invalid operator: ${this.operator}`);
    }
  }

  toClickhouseQuery(): ClickhouseFilter {
    const varName = `stringFilter${this.field}`;
    return {
      query: `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field} ${this.operator} {${varName}: String}`,
      params: { [varName]: this.value },
    };
  }

  apply() {
    // this.verify();
    return this.toClickhouseQuery();
  }
}

class DateTimeFilter implements Filter {
  public clickhouseTable: string;
  protected field: string;
  protected value: Date;
  protected operator: string;
  protected tablePrefix?: string;

  constructor(opts: {
    clickhouseTable: string;
    field: string;
    operator: string;
    value: Date;
    tablePrefix?: string;
  }) {
    this.clickhouseTable = opts.clickhouseTable;
    this.field = opts.field;
    this.value = opts.value;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
  }

  verify() {
    if (!(this.clickhouseTable in ClickhouseTableNames)) {
      throw new QueryBuilderError(
        `Table ${this.clickhouseTable} does not exist in Clickhouse schema.`
      );
    }

    if (!isColumnOnSchema(this.clickhouseTable, this.field)) {
      throw new QueryBuilderError(
        `Column ${this.field} does not exist in table ${this.clickhouseTable}.`
      );
    }

    const validOperators = ["=", "!=", ">", "<", ">=", "<="];
    if (!validOperators.includes(this.operator)) {
      throw new QueryBuilderError(`Invalid operator: ${this.operator}`);
    }
  }

  toClickhouseQuery(): ClickhouseFilter {
    const varName = `timeFilter${this.field}`;
    return {
      query: `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field} ${this.operator} {${varName}: DateTime64(3)}`,
      params: { [varName]: new Date(this.value).getTime() },
    };
  }
  apply() {
    this.verify();
    return this.toClickhouseQuery();
  }
}

export class FilterList {
  private filters: Filter[];

  constructor(filters: Filter[]) {
    this.filters = filters;
  }

  push(...filter: Filter[]) {
    this.filters.push(...filter);
  }

  public apply(): ClickhouseFilter {
    const queries = this.filters.map((filter) => filter.apply().query);
    const params = this.filters.reduce((acc, filter) => {
      return { ...acc, ...filter.toClickhouseQuery().params };
    }, {});

    return {
      query: queries.join(" AND "),
      params,
    };
  }
}

export const createFilterFromFilterState = (
  filter: FilterCondition[],
  opts?: {
    tracesPrefix?: string;
    observationsPrefix?: string;
    scoresPrefix?: string;
  }
) => {
  return filter.map((frontEndFilter) => {
    const { col, table } = matchAndVerifyTracesUiColumn(
      frontEndFilter,
      tracesTableUiColumnDefinitions
    );

    switch (frontEndFilter.type) {
      case "string":
        return new StringFilter({
          clickhouseTable: table,
          field: col.name,
          operator: frontEndFilter.operator,
          value: frontEndFilter.value,
          tablePrefix: opts?.tracesPrefix,
        });
      case "datetime":
        return new DateTimeFilter({
          clickhouseTable: table,
          field: col.name,
          operator: frontEndFilter.operator,
          value: frontEndFilter.value,
          tablePrefix: opts?.tracesPrefix,
        });
      default:
        throw new QueryBuilderError(
          `Invalid filter type: ${frontEndFilter.type}`
        );
    }
  });
};

// function only returns valid columns from the clickhouse schema
const matchAndVerifyTracesUiColumn = (
  filter: z.infer<typeof singleFilter>,
  uiTableDefinitions: UiColumnMapping[]
) => {
  // tries to match the column name to the clickhouse table name
  logger.info(`Filterr to match: ${JSON.stringify(filter)}`);

  const uiTable = uiTableDefinitions.find(
    (col) => col.uiTableName === filter.column
  );

  if (!uiTable) {
    throw new QueryBuilderError(
      `Column ${filter.column} does not exist in table ${uiTable}.`
    );
  }

  if (!isValidTableName(uiTable.clickhouseTableName)) {
    throw new QueryBuilderError(
      `Invalid clickhouse table name: ${uiTable.clickhouseTableName}`
    );
  }

  if (
    !isKeyOfClickhouseRecord(
      uiTable.clickhouseTableName,
      uiTable.clickhouseColumnName
    )
  ) {
    throw new QueryBuilderError(
      `Column ${uiTable.clickhouseColumnName} does not exist in table ${uiTable}.`
    );
  }

  if (uiTable.clickhouseTableName === "traces") {
    const column = TraceClickhouseColumns.find(
      (col) => col.name === uiTable.clickhouseColumnName
    );
    if (!column) {
      throw new QueryBuilderError(
        `Column ${uiTable.clickhouseColumnName} does not exist in traces table.`
      );
    }
    return {
      col: column,
      table: uiTable.clickhouseTableName,
    };
  } else if (uiTable.clickhouseTableName === "observations") {
    const column = ObservationClickhouseColumns.find(
      (col) => col.name === uiTable.clickhouseColumnName
    );
    if (!column) {
      throw new QueryBuilderError(
        `Column ${uiTable.clickhouseColumnName} does not exist in observations table.`
      );
    }
    return {
      col: column,
      table: uiTable.clickhouseTableName,
    };
  }
  throw new QueryBuilderError(
    `Unhandled table case: ${uiTable.clickhouseTableName}`
  );
};
