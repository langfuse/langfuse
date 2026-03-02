import { filterOperators } from "../../../interfaces/filters";
import { DatabaseAdapterFactory } from "../../database";

export type ClickhouseOperator =
  | (typeof filterOperators)[keyof typeof filterOperators][number]
  | "!=";
export interface Filter {
  apply(): ClickhouseFilter;
  clickhouseTable: string;
  tablePrefix?: string;
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
  public tablePrefix?: string;

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
    const adapter = DatabaseAdapterFactory.getInstance();
    const varName = `stringFilter${adapter.compliantRandomCharacters()}`;

    const fieldWithPrefix = `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}`;
    let query: string;

    switch (this.operator) {
      case "=":
        query = `${fieldWithPrefix} = {${varName}: String}`;
        break;
      case "contains":
        // OceanBase uses LOCATE(needle, haystack), ClickHouse uses position(haystack, needle)
        query = `LOCATE({${varName}: String}, ${fieldWithPrefix}) > 0`;
        break;
      case "does not contain":
        // OceanBase uses LOCATE(needle, haystack), ClickHouse uses position(haystack, needle)
        query = `LOCATE({${varName}: String}, ${fieldWithPrefix}) = 0`;
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
  public tablePrefix?: string;

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
    const adapter = DatabaseAdapterFactory.getInstance();
    const uid = adapter.compliantRandomCharacters();
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
  public tablePrefix?: string;

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
    const adapter = DatabaseAdapterFactory.getInstance();
    const uid = adapter.compliantRandomCharacters();
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
  public tablePrefix?: string;

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
    const adapter = DatabaseAdapterFactory.getInstance();
    const uid = adapter.compliantRandomCharacters();
    const varName = `stringOptionsFilter${uid}`;
    return {
      query:
        this.operator === "any of"
          ? `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field} IN ({${varName}: Array(String)})`
          : `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field} NOT IN ({${varName}: Array(String)})`,
      params: { [varName]: this.values },
    };
  }
}

export class CategoryOptionsFilter implements Filter {
  public clickhouseTable: string;
  public field: string;
  public key: string;
  public values: string[];
  public operator: (typeof filterOperators.categoryOptions)[number];
  public tablePrefix?: string;

  constructor(opts: {
    clickhouseTable: string;
    field: string;
    operator: (typeof filterOperators.categoryOptions)[number];
    key: string;
    values: string[];
    tablePrefix?: string;
  }) {
    this.clickhouseTable = opts.clickhouseTable;
    this.field = opts.field;
    this.key = opts.key;
    this.values = opts.values;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
  }

  apply(): ClickhouseFilter {
    const adapter = DatabaseAdapterFactory.getInstance();
    const uid = adapter.compliantRandomCharacters();
    const varName = `categoryOptionsFilter${uid}`;

    // Flatten the hierarchical structure into array of "parent:child" strings for improved query performance
    const flattenedValues: string[] = [];
    this.values.forEach((child) => {
      flattenedValues.push(`${this.key}:${child}`);
    });

    const fieldRef = `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}`;

    switch (this.operator) {
      case "any of":
        return {
          query: `hasAny(${fieldRef}, {${varName}: Array(String)})`,
          params: { [varName]: flattenedValues },
        };
      case "none of":
        return {
          query: `NOT hasAny(${fieldRef}, {${varName}: Array(String)})`,
          params: { [varName]: flattenedValues },
        };
      default:
        throw new Error(`Unsupported operator: ${this.operator}`);
    }
  }
}

// stringObject filter is used when we want to filter on a key value pair in metadata.
// For observations/traces tables: uses JSON column (metadata) with JSON_VALUE
// For events table: uses Array columns (metadata_names/metadata_prefixes)
// We can only filter efficiently on the first level of a json obj.
export class StringObjectFilter implements Filter {
  public clickhouseTable: string;
  public field: string;
  public key: string;
  public value: string;
  public operator: (typeof filterOperators)["stringObject"][number];
  public tablePrefix?: string;

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
    const adapter = DatabaseAdapterFactory.getInstance();
    const varKeyName = `stringObjectKeyFilter${adapter.compliantRandomCharacters()}`;
    const varValueName = `stringObjectValueFilter${adapter.compliantRandomCharacters()}`;
    const prefix = this.tablePrefix ? this.tablePrefix + "." : "";

    // Events table uses array columns (metadata_names/metadata_prefixes)
    // Observations/traces tables use JSON column (metadata)
    const isEventsTable = this.clickhouseTable === "events";

    let query: string;
    let params: { [x: string]: any };

    if (isEventsTable) {
      // For events table, use array access: metadata_prefixes[indexOf(metadata_names, key)]
      const namesColumn = `${prefix}metadata_names`;
      const valuesColumn = `${prefix}metadata_prefixes`;
      // OceanBase: 使用 JSON_SEARCH 和 JSON_EXTRACT 来模拟数组索引访问
      // 需要找到 key 在 metadata_names 数组中的位置，然后从 metadata_prefixes 获取对应值
      const valueAccessor = `JSON_EXTRACT(${valuesColumn}, CONCAT('$[', JSON_SEARCH(${namesColumn}, 'one', {${varKeyName}: String}) - 1, ']'))`;

      switch (this.operator) {
        case "=":
          query = `${valueAccessor} = {${varValueName}: String}`;
          params = { [varKeyName]: this.key, [varValueName]: this.value };
          break;
        case "contains":
          query = `LOCATE({${varValueName}: String}, ${valueAccessor}) > 0`;
          params = { [varKeyName]: this.key, [varValueName]: this.value };
          break;
        case "does not contain":
          query = `LOCATE({${varValueName}: String}, ${valueAccessor}) = 0`;
          params = { [varKeyName]: this.key, [varValueName]: this.value };
          break;
        case "starts with":
          query = `${valueAccessor} LIKE CONCAT({${varValueName}: String}, '%')`;
          params = { [varKeyName]: this.key, [varValueName]: this.value };
          break;
        case "ends with":
          query = `${valueAccessor} LIKE CONCAT('%', {${varValueName}: String})`;
          params = { [varKeyName]: this.key, [varValueName]: this.value };
          break;
        default:
          throw new Error(`Unsupported operator: ${this.operator}`);
      }
    } else {
      // For observations/traces tables, use JSON_VALUE to access metadata
      const column = `${prefix}${this.field}`;

      // OceanBase: 使用 JSON_VALUE 访问 JSON 字段
      // 如果 key 是纯数字或包含特殊字符，需要用引号括起来
      const needsQuotes = /^\d+$/.test(this.key) || /[[\]\s]/.test(this.key);
      const jsonPath = needsQuotes ? `$."${this.key}"` : `$.${this.key}`;
      const jsonExtract = `JSON_VALUE(${column}, '${jsonPath}')`;

      switch (this.operator) {
        case "=":
          query = `${jsonExtract} = {${varValueName}: String}`;
          params = { [varValueName]: this.value };
          break;
        case "contains":
          query = `LOCATE({${varValueName}: String}, ${jsonExtract}) > 0`;
          params = { [varValueName]: this.value };
          break;
        case "does not contain":
          query = `LOCATE({${varValueName}: String}, ${jsonExtract}) = 0`;
          params = { [varValueName]: this.value };
          break;
        case "starts with":
          query = `${jsonExtract} LIKE CONCAT({${varValueName}: String}, '%')`;
          params = { [varValueName]: this.value };
          break;
        case "ends with":
          query = `${jsonExtract} LIKE CONCAT('%', {${varValueName}: String})`;
          params = { [varValueName]: this.value };
          break;
        default:
          throw new Error(`Unsupported operator: ${this.operator}`);
      }
    }

    return {
      query,
      params,
    };
  }
}

// this is used when we want to filter multiple values on a clickhouse column which is also an array
export class ArrayOptionsFilter implements Filter {
  public clickhouseTable: string;
  public field: string;
  public values: string[];
  public operator: (typeof filterOperators.arrayOptions)[number];
  public tablePrefix?: string;

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
    const adapter = DatabaseAdapterFactory.getInstance();
    const uid = adapter.compliantRandomCharacters();
    const fieldRef = `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}`;
    let query: string;
    const params: Record<string, any> = {};

    // OceanBase implementation using JSON_CONTAINS
    switch (this.operator) {
      case "any of": {
        // Check if any element in the array matches any value in the filter
        // Use JSON_CONTAINS for each value and OR them together
        const anyOfChecks = this.values.map((_, idx) => {
          const varName = `arrayOptionsFilter${uid}_${idx}`;
          params[varName] = `"${this.values[idx]}"`; // JSON_CONTAINS needs quoted string
          return `JSON_CONTAINS(${fieldRef}, {${varName}: String}, '$')`;
        });
        query =
          anyOfChecks.length > 1
            ? `(${anyOfChecks.join(" OR ")})`
            : anyOfChecks[0];
        break;
      }
      case "none of": {
        // Check that no element in the array matches any value in the filter
        const noneOfChecks = this.values.map((_, idx) => {
          const varName = `arrayOptionsFilter${uid}_${idx}`;
          params[varName] = `"${this.values[idx]}"`;
          return `JSON_CONTAINS(${fieldRef}, {${varName}: String}, '$')`;
        });
        query =
          noneOfChecks.length > 1
            ? `NOT (${noneOfChecks.join(" OR ")})`
            : `NOT ${noneOfChecks[0]}`;
        break;
      }
      case "all of": {
        // Check that all filter values exist in the array
        const allOfChecks = this.values.map((_, idx) => {
          const varName = `arrayOptionsFilter${uid}_${idx}`;
          params[varName] = `"${this.values[idx]}"`;
          return `JSON_CONTAINS(${fieldRef}, {${varName}: String}, '$')`;
        });
        query =
          allOfChecks.length > 1
            ? `(${allOfChecks.join(" AND ")})`
            : allOfChecks[0];
        break;
      }
      default:
        throw new Error(`Unsupported operator: ${this.operator}`);
    }

    return {
      query,
      params,
    };
  }
}

export class NullFilter implements Filter {
  public clickhouseTable: string;
  public field: string;
  public operator: (typeof filterOperators)["null"][number];
  public tablePrefix?: string;

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
  public tablePrefix?: string;

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
    const adapter = DatabaseAdapterFactory.getInstance();
    const varValueName = `numberObjectValueFilter${adapter.compliantRandomCharacters()}`;
    const column = `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}`;

    let query: string;
    let params: { [x: string]: any };

    // OceanBase: 数据格式为 [{"name": "key", "value": number}]
    // 使用 JSON_EXTRACT 查找匹配 name 的对象，然后提取 value
    // 使用子查询或者 JSON_SEARCH 来定位数组中的元素
    query = `(
        SELECT CAST(JSON_EXTRACT(elem, '$.value') AS DECIMAL(20, 6))
        FROM JSON_TABLE(
          ${column},
          '$[*]' COLUMNS(
            elem JSON PATH '$'
          )
        ) AS jt
        WHERE JSON_EXTRACT(elem, '$.name') = '${this.key}'
        LIMIT 1
      ) ${this.operator} {${varValueName}: Decimal64(12)}`;
    params = { [varValueName]: this.value };

    return {
      query,
      params,
    };
  }
}

export class BooleanFilter implements Filter {
  public clickhouseTable: string;
  public field: string;
  public operator: (typeof filterOperators)["boolean"][number];
  public value: boolean;
  public tablePrefix?: string;

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
    const adapter = DatabaseAdapterFactory.getInstance();
    const uid = adapter.compliantRandomCharacters();
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

  filter(predicate: (filter: Filter) => boolean) {
    return new FilterList(this.filters.filter(predicate));
  }

  map(predicate: (filter: Filter) => Filter) {
    return new FilterList(this.filters.map(predicate));
  }

  some(predicate: (filter: Filter) => boolean) {
    return this.filters.some(predicate);
  }

  forEach(callback: (filter: Filter) => void) {
    this.filters.forEach(callback);
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
