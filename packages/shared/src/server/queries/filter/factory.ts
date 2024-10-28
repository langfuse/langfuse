import { ClickhouseTableNames } from "../../clickhouse/schema";

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
}

type ClickhouseFilter = {
  query: string;
  params: { [x: string]: string };
};

export class StringFilter implements Filter {
  private clickhouseTable: string;
  private field: string;
  private value: string;
  private operator: string;
  private tablePrefix?: string;

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
    if (this.operator !== "=" && this.operator !== "!=") {
      throw new QueryBuilderError(`Invalid operator: ${this.operator}`);
    }

    if (!(this.clickhouseTable in ClickhouseTableNames)) {
      throw new QueryBuilderError(
        `Table ${this.clickhouseTable} does not exist in Clickhouse schema.`
      );
    }

    // TODO: also check whether column exists
    // TODO: also check whether prefix should be allowed
  }

  toClickhouseQuery(): ClickhouseFilter {
    // Escape single quotes in the value to prevent query injection
    const escapedValueParam = this.value.replace(/'/g, "\\'");
    const varName = `stringFilter${this.field}`;
    return {
      query: `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field} ${this.operator} {${varName}: String}`,
      params: { [varName]: escapedValueParam },
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
