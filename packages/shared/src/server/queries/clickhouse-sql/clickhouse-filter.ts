import { filterOperators } from "../../../interfaces/filters";
import { clickhouseCompliantRandomCharacters } from "../../repositories";

export type ClickhouseOperator =
  | (typeof filterOperators)[keyof typeof filterOperators][number]
  | "!=";
export interface Filter {
  apply(): ClickhouseFilter;
  clickhouseTable: string;
  operator: ClickhouseOperator;
  field: string;
}
type ClickhouseFilter = {
  query: string;
  params: { [x: string]: any } | {};
};

export class StringFilter implements Filter {
  public clickhouseTable: string;
  public field: string;
  public value: string;
  public operator: (typeof filterOperators)["string"][number];
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
    const varName = `stringFilter${clickhouseCompliantRandomCharacters()}`;

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
  public field: string;
  public value: number;
  public operator: (typeof filterOperators)["number"][number] | "!=";
  public clickhouseTypeOverwrite?: string;
  protected tablePrefix?: string;

  constructor(opts: {
    clickhouseTable: string;
    field: string;
    operator: (typeof filterOperators)["number"][number] | "!=";
    value: number;
    tablePrefix?: string;
    clickhouseTypeOverwrite?: string;
  }) {
    this.clickhouseTable = opts.clickhouseTable;
    this.field = opts.field;
    this.value = opts.value;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
    this.clickhouseTypeOverwrite = opts.clickhouseTypeOverwrite;
  }

  apply(): ClickhouseFilter {
    const uid = clickhouseCompliantRandomCharacters();
    const varName = `numberFilter${uid}`;
    const type = this.clickhouseTypeOverwrite ?? "Decimal64(12)";
    return {
      query: `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field} ${this.operator} {${varName}: ${type}}`,
      params: { [varName]: this.value.toString() },
    };
  }
}

export class DateTimeFilter implements Filter {
  public clickhouseTable: string;
  public field: string;
  public value: Date;
  public operator: (typeof filterOperators)["datetime"][number];
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
    const uid = clickhouseCompliantRandomCharacters();
    const varName = `dateTimeFilter${uid}`;
    return {
      query: `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field} ${this.operator} {${varName}: DateTime64(3)}`,
      params: { [varName]: new Date(this.value).getTime() },
    };
  }
}

export class StringOptionsFilter implements Filter {
  public clickhouseTable: string;
  public field: string;
  public values: string[];
  public operator: (typeof filterOperators.stringOptions)[number];
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
    const uid = clickhouseCompliantRandomCharacters();
    const varName = `stringOptionsFilter${uid}`;
    return {
      query:
        this.operator === "any of"
          ? `has({${varName}: Array(String)}, ${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}) = True`
          : `has({${varName}: Array(String)}, ${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}) = False`,
      params: { [varName]: this.values },
    };
  }
}

// stringObject filter is used when we want to filter on a key value pair in a clickhouse map.
// As we use the MAP form clickhouse, we can only filter efficiently on the first level of a json obj.
export class StringObjectFilter implements Filter {
  public clickhouseTable: string;
  public field: string;
  public key: string;
  public value: string;
  public operator: (typeof filterOperators)["stringObject"][number];
  protected tablePrefix?: string;

  constructor(opts: {
    clickhouseTable: string;
    field: string;
    operator: (typeof filterOperators)["stringObject"][number];
    key: string;
    value: string;
    tablePrefix?: string;
  }) {
    this.clickhouseTable = opts.clickhouseTable;
    this.field = opts.field;
    this.value = opts.value;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
    this.key = opts.key;
  }

  apply(): ClickhouseFilter {
    const varKeyName = `stringObjectKeyFilter${clickhouseCompliantRandomCharacters()}`;
    const varValueName = `stringObjectValueFilter${clickhouseCompliantRandomCharacters()}`;
    const column = `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}`;

    //  const query: `${column}['{varKeyName: String}'] ${this.operator} {${varValueName}: String}`,
    let query: string;
    switch (this.operator) {
      case "=":
        query = `${column}[{${varKeyName}: String}] = {${varValueName}: String}`;
        break;
      case "contains":
        query = `position(${column}[{${varKeyName}: String}], {${varValueName}: String}) > 0`;
        break;
      case "does not contain":
        query = `position(${column}[{${varKeyName}: String}], {${varValueName}: String}) = 0`;
        break;
      case "starts with":
        query = `startsWith(${column}[{${varKeyName}: String}], {${varValueName}: String})`;
        break;
      case "ends with":
        query = `endsWith(${column}[{${varKeyName}: String}], {${varValueName}: String})`;
        break;
      default:
        throw new Error(`Unsupported operator: ${this.operator}`);
    }

    return {
      query,
      params: { [varKeyName]: this.key, [varValueName]: this.value },
    };
  }
}

// this is used when we want to filter multiple values on a clickhouse column which is also an array
export class ArrayOptionsFilter implements Filter {
  public clickhouseTable: string;
  public field: string;
  public values: string[];
  public operator: (typeof filterOperators.arrayOptions)[number];
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
    const uid = clickhouseCompliantRandomCharacters();
    const varName = `arrayOptionsFilter${uid}`;
    let query: string;

    switch (this.operator) {
      case "any of":
        query = `hasAny({${varName}: Array(String)}, ${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}) = True`;
        break;
      case "none of":
        query = `hasAny({${varName}: Array(String)}, ${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}) = False`;
        break;
      case "all of":
        query = `hasAll(${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}, {${varName}: Array(String)}) = True`;
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

export class NullFilter implements Filter {
  public clickhouseTable: string;
  public field: string;
  public operator: (typeof filterOperators)["null"][number];
  protected tablePrefix?: string;

  constructor(opts: {
    clickhouseTable: string;
    field: string;
    operator: (typeof filterOperators)["null"][number];
    tablePrefix?: string;
  }) {
    this.clickhouseTable = opts.clickhouseTable;
    this.field = opts.field;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
  }

  apply(): ClickhouseFilter {
    return {
      query: `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field} ${this.operator}`,
      params: {},
    };
  }
}

export class NumberObjectFilter implements Filter {
  public clickhouseTable: string;
  public field: string;
  public key: string;
  public value: number;
  public operator: (typeof filterOperators)["numberObject"][number] | "!=";
  protected tablePrefix?: string;

  constructor(opts: {
    clickhouseTable: string;
    field: string;
    operator: (typeof filterOperators)["numberObject"][number] | "!=";
    key: string;
    value: number;
    tablePrefix?: string;
  }) {
    this.clickhouseTable = opts.clickhouseTable;
    this.field = opts.field;
    this.value = opts.value;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
    this.key = opts.key;
  }

  apply(): ClickhouseFilter {
    const varKeyName = `numberObjectKeyFilter${clickhouseCompliantRandomCharacters()}`;
    const varValueName = `numberObjectValueFilter${clickhouseCompliantRandomCharacters()}`;
    const column = `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}`;
    return {
      query: `empty(arrayFilter(x -> (((x.1) = {${varKeyName}: String}) AND ((x.2) ${this.operator} {${varValueName}: Decimal64(12)})), ${column})) = 0`,
      params: { [varKeyName]: this.key, [varValueName]: this.value },
    };
  }
}

export class BooleanFilter implements Filter {
  public clickhouseTable: string;
  public field: string;
  public operator: (typeof filterOperators)["boolean"][number];
  public value: boolean;
  protected tablePrefix?: string;

  constructor(opts: {
    clickhouseTable: string;
    field: string;
    operator: (typeof filterOperators)["boolean"][number];
    value: boolean;
    tablePrefix?: string;
  }) {
    this.clickhouseTable = opts.clickhouseTable;
    this.field = opts.field;
    this.value = opts.value;
    this.tablePrefix = opts.tablePrefix;
    this.operator = opts.operator;
  }

  apply(): ClickhouseFilter {
    const uid = clickhouseCompliantRandomCharacters();
    const varName = `booleanFilter${uid}`;
    return {
      query: `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field} ${this.operator} {${varName}: Boolean}`,
      params: { [varName]: this.value },
    };
  }
}

export class FilterList {
  private filters: Filter[];

  constructor(filters: Filter[] = []) {
    this.filters = filters;
  }

  push(...filter: Filter[]) {
    this.filters.push(...filter);
  }

  find(predicate: (filter: Filter) => boolean) {
    return this.filters.find(predicate);
  }

  length() {
    return this.filters.length;
  }

  public apply(): ClickhouseFilter {
    if (this.filters.length === 0) {
      return {
        query: "",
        params: {},
      };
    }
    const compiledQueries = this.filters.map((filter) => filter.apply());
    const { params, queries } = compiledQueries.reduce(
      (acc, { params, query }) => {
        acc.params = { ...acc.params, ...params };
        acc.queries.push(query);
        return acc;
      },
      { params: {}, queries: [] as string[] },
    );
    return {
      query: queries.join(" AND "),
      params,
    };
  }
}
