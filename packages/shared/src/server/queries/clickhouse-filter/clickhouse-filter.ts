import { filterOperators } from "../../../interfaces/filters";

export interface Filter {
  apply(): ClickhouseFilter;
  clickhouseTable: string;
}
type ClickhouseFilter = {
  query: string;
  params: { [x: string]: any };
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

  apply(): ClickhouseFilter {
    const varName = `stringFilter${this.field}`;
    return {
      query: `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field} ${this.operator} {${varName}: String}`,
      params: { [varName]: this.value },
    };
  }
}

export class DateTimeFilter implements Filter {
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

  apply(): ClickhouseFilter {
    const varName = `timeFilter${this.field}`;
    return {
      query: `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field} ${this.operator} {${varName}: DateTime64(3)}`,
      params: { [varName]: new Date(this.value).getTime() },
    };
  }
}

export class StringOptionsFilter implements Filter {
  public clickhouseTable: string;
  protected field: string;
  protected values: string[];
  protected operator: string;
  protected tablePrefix?: string;

  constructor(opts: {
    clickhouseTable: string;
    field: string;
    operator: (typeof filterOperators.stringOptions)[number];
    values: string[];
    tablePrefix?: string;
  }) {
    this.clickhouseTable = opts.clickhouseTable;
    this.field = opts.field;
    this.values = opts.values;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
  }

  apply(): ClickhouseFilter {
    const varName = `stringOptionsFilter${this.field}`;
    return {
      query:
        this.operator === "any of"
          ? `has([{${varName}: Array(String)}], ${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}) = True`
          : `has([{${varName}: Array(String)}], ${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}) = False`,
      params: { [varName]: this.values },
    };
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
      return { ...acc, ...filter.apply().params };
    }, {});

    return {
      query: queries.join(" AND "),
      params,
    };
  }
}
