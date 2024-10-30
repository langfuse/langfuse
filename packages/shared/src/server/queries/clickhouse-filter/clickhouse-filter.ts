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
  protected operator: (typeof filterOperators)["string"][number];
  protected tablePrefix?: string;

  constructor(opts: {
    clickhouseTable: string;
    field: string;
    operator: (typeof filterOperators)["string"][number];
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

    const fieldWithPrefix = `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}`;
    let query: string;
    switch (this.operator) {
      case "=":
        query = `${fieldWithPrefix} = {${varName}: String}`;
        break;
      case "contains":
        query = `position(${fieldWithPrefix}, {${varName}: String}) > 0`;
        break;
      case "does not contain":
        query = `position(${fieldWithPrefix}, {${varName}: String}) = 0`;
        break;
      case "starts with":
        query = `startsWith(${fieldWithPrefix}, {${varName}: String})`;
        break;
      case "ends with":
        query = `endsWith(${fieldWithPrefix}, {${varName}: String})`;
        break;
      default:
        throw new Error(`Unsupported operator: ${this.operator}`);
    }

    return {
      query: query,
      params: { [varName]: this.value },
    };
  }
}

export class NumberFilter implements Filter {
  public clickhouseTable: string;
  protected field: string;
  protected value: number;
  protected operator: (typeof filterOperators)["number"][number];
  protected tablePrefix?: string;

  constructor(opts: {
    clickhouseTable: string;
    field: string;
    operator: (typeof filterOperators)["number"][number];
    value: number;
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
  protected operator: (typeof filterOperators)["datetime"][number];
  protected tablePrefix?: string;

  constructor(opts: {
    clickhouseTable: string;
    field: string;
    operator: (typeof filterOperators)["datetime"][number];
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
  protected operator: (typeof filterOperators.stringOptions)[number];
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
          ? `has({${varName}: Array(String)}, ${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}) = True`
          : `has({${varName}: Array(String)}, ${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}) = False`,
      params: { [varName]: this.values },
    };
  }
}

// this is used when we want to filter multiple values on a clickhouse column which is also an array
export class ArrayOptionsFilter implements Filter {
  public clickhouseTable: string;
  protected field: string;
  protected values: string[];
  protected operator: (typeof filterOperators.arrayOptions)[number];
  protected tablePrefix?: string;

  constructor(opts: {
    clickhouseTable: string;
    field: string;
    operator: (typeof filterOperators.arrayOptions)[number];
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
    const varName = `arrayOptionsFilter${this.field}`;
    let query: string;

    switch (this.operator) {
      case "any of":
        query = `hasAny({${varName}: Array(String)}, ${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}) = True`;
        break;
      case "none of":
        query = `hasAny({${varName}: Array(String)}, ${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}) = False`;
        break;
      case "all of":
        query = `arrayAll(x -> has({${varName}: Array(String)}, x), ${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}) = True`;
        break;
      default:
        throw new Error(`Unsupported operator: ${this.operator}`);
    }

    return {
      query,
      params: { [varName]: this.values },
    };
  }
}

export class BooleanFilter implements Filter {
  public clickhouseTable: string;
  protected field: string;
  protected value: boolean;
  protected tablePrefix?: string;

  constructor(opts: {
    clickhouseTable: string;
    field: string;
    value: boolean;
    tablePrefix?: string;
  }) {
    this.clickhouseTable = opts.clickhouseTable;
    this.field = opts.field;
    this.value = opts.value;
    this.tablePrefix = opts.tablePrefix;
  }

  apply(): ClickhouseFilter {
    const varName = `booleanFilter${this.field}`;
    return {
      query: `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field} = {${varName}: Boolean}`,
      params: { [varName]: this.value },
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

  public apply(): ClickhouseFilter | undefined {
    if (this.filters.length === 0) {
      return undefined;
    }
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
