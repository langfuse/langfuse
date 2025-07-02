import { filterOperators } from "../../../interfaces/filters";
import { clickhouseCompliantRandomCharacters } from "../../repositories";
import { Filter,DbFilter } from "../filter";


// export type DorisOperator =
//   | (typeof filterOperators)[keyof typeof filterOperators][number]
//   | "!=";
// export interface Filter {
//   apply(): DbFilter;
//   table: string;
//   operator: DorisOperator;
//   field: string;
// }
// type DbFilter = {
//   query: string;
//   params: { [x: string]: any } | {};
// };
export class StringFilter implements Filter {
  public table: string;
  public field: string;
  public value: string;
  public operator: (typeof filterOperators)["string"][number];
  protected tablePrefix?: string;

  constructor(opts: {
    dorisTable: string;
    field: string;
    operator: (typeof filterOperators)["string"][number];
    value: string;
    tablePrefix?: string;
  }) {
    this.table = opts.dorisTable;
    this.field = opts.field;
    this.value = opts.value;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
  }

  apply(): DbFilter {
    const fieldWithPrefix = `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}`;
    
    // 转义单引号以防止SQL注入
    const escapedValue = this.value.replace(/'/g, "''");
    
    let query: string;
    switch (this.operator) {
      case "=":
        // 精确匹配使用等号，可以利用索引
        query = `${fieldWithPrefix} = '${escapedValue}'`;
        break;
      case "contains":
        // 包含操作，优先使用INSTR函数，性能比LIKE更好
        query = `INSTR(${fieldWithPrefix}, '${escapedValue}') > 0`;
        break;
      case "does not contain":
        // 不包含操作
        query = `INSTR(${fieldWithPrefix}, '${escapedValue}') = 0`;
        break;
      case "starts with":
        // 开始于操作，使用STARTS_WITH函数
        query = `STARTS_WITH(${fieldWithPrefix}, '${escapedValue}')`;
        break;
      case "ends with":
        // 结束于操作，使用ENDS_WITH函数  
        query = `ENDS_WITH(${fieldWithPrefix}, '${escapedValue}')`;
        break;
      default:
        throw new Error(`Unsupported operator: ${this.operator}`);
    }

    return {
      query: query,
      params: {}, // Doris 不使用参数化查询，所以 params 为空
    };
  }
}

export class NumberFilter implements Filter {
  public table: string;
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
    this.table = opts.clickhouseTable;
    this.field = opts.field;
    this.value = opts.value;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
    this.clickhouseTypeOverwrite = opts.clickhouseTypeOverwrite;
  }

  apply(): DbFilter {
    const fieldWithPrefix = `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}`;
    
    return {
      query: `${fieldWithPrefix} ${this.operator} ${this.value}`,
      params: {}, // Doris 不使用参数化查询
    };
  }
}

export class DateTimeFilter implements Filter {
  public table: string;
  public field: string;
  public value: Date;
  public operator: (typeof filterOperators)["datetime"][number];
  protected tablePrefix?: string;

  constructor(opts: {
    table: string;
    field: string;
    operator: (typeof filterOperators)["datetime"][number];
    value: Date;
    tablePrefix?: string;
  }) {
    this.table = opts.table;
    this.field = opts.field;
    this.value = opts.value;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
  }

  apply(): DbFilter {
    const fieldWithPrefix = `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}`;
    
    // 将Date对象转换为Doris DateTime(3)格式的字符串
    // const dateTimeString = this.value.toISOString().replace('T', ' ').replace('Z', '');
    const dateTimeString = this.value
      .toLocaleString("sv-SE", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        fractionalSecondDigits: 3,
      })
      .replace("T", " ")
      .replace(",", ".");
    
    return {
      query: `${fieldWithPrefix} ${this.operator} '${dateTimeString}'`,
      params: {}, // Doris 不使用参数化查询
    };
  }
}

export class StringOptionsFilter implements Filter {
  public table: string;
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
    this.table = opts.clickhouseTable;
    this.field = opts.field;
    this.values = opts.values;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
  }

  apply(): DbFilter {
    const fieldWithPrefix = `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}`;
    
    // 转义每个值的单引号
    const escapedValues = this.values.map(value => `'${value.replace(/'/g, "''")}'`);
    const valuesList = escapedValues.join(', ');
    
    const query = this.operator === "any of"
      ? `${fieldWithPrefix} IN (${valuesList})`
      : `${fieldWithPrefix} NOT IN (${valuesList})`;

    return {
      query,
      params: {}, // Doris 不使用参数化查询
    };
  }
}

export class BooleanFilter implements Filter {
  public table: string;
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
    this.table = opts.clickhouseTable;
    this.field = opts.field;
    this.value = opts.value;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
  }

  apply(): DbFilter {
    const fieldWithPrefix = `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}`;
    
    return {
      query: `${fieldWithPrefix} ${this.operator} ${this.value ? 'TRUE' : 'FALSE'}`,
      params: {}, // Doris 不使用参数化查询
    };
  }
}

export class NullFilter implements Filter {
  public table: string;
  public field: string;
  public operator: (typeof filterOperators)["null"][number];
  protected tablePrefix?: string;

  constructor(opts: {
    clickhouseTable: string;
    field: string;
    operator: (typeof filterOperators)["null"][number];
    tablePrefix?: string;
  }) {
    this.table = opts.clickhouseTable;
    this.field = opts.field;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
  }

  apply(): DbFilter {
    const fieldWithPrefix = `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}`;
    
    return {
      query: `${fieldWithPrefix} ${this.operator}`,
      params: {},
    };
  }
}

export class ArrayOptionsFilter implements Filter {
  public table: string;
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
    this.table = opts.clickhouseTable;
    this.field = opts.field;
    this.values = opts.values;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
  }

  apply(): DbFilter {
    const fieldWithPrefix = `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}`;
    
    // 转义每个值的单引号
    const escapedValues = this.values.map(value => `'${value.replace(/'/g, "''")}'`);
    
    let query: string;
    switch (this.operator) {
      case "any of":
        // 检查数组是否包含任何指定值，使用ARRAY_OVERLAP函数
        query = `ARRAY_OVERLAP(${fieldWithPrefix}, ARRAY[${escapedValues.join(', ')}])`;
        break;
      case "none of":
        // 检查数组不包含任何指定值
        query = `NOT ARRAY_OVERLAP(${fieldWithPrefix}, ARRAY[${escapedValues.join(', ')}])`;
        break;
      case "all of":
        // 检查数组包含所有指定值，需要遍历检查
        const allChecks = escapedValues.map(value => 
          `ARRAY_CONTAINS(${fieldWithPrefix}, ${value})`
        ).join(' AND ');
        query = `(${allChecks})`;
        break;
      default:
        throw new Error(`Unsupported operator: ${this.operator}`);
    }

    return {
      query,
      params: {},
    };
  }
}

export class CategoryOptionsFilter implements Filter {
  public table: string;
  public field: string;
  public key: string;
  public values: string[];
  public operator: (typeof filterOperators.categoryOptions)[number];
  protected tablePrefix?: string;

  constructor(opts: {
    clickhouseTable: string;
    field: string;
    operator: (typeof filterOperators.categoryOptions)[number];
    key: string;
    values: string[];
    tablePrefix?: string;
  }) {
    this.table = opts.clickhouseTable;
    this.field = opts.field;
    this.key = opts.key;
    this.values = opts.values;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
  }

  apply(): DbFilter {
    // 将分类值扁平化为 "key:value" 格式
    const flattenedValues: string[] = [];
    this.values.forEach((child) => {
      flattenedValues.push(`${this.key}:${child}`);
    });

    const fieldRef = `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}`;
    
    // 转义每个值
    const escapedValues = flattenedValues.map(value => `'${value.replace(/'/g, "''")}'`);
    const valuesList = escapedValues.join(', ');

    switch (this.operator) {
      case "any of":
        // 检查数组是否包含任何指定值
        return {
          query: `ARRAY_OVERLAP(${fieldRef}, [${valuesList}])`,
          params: {},
        };
      case "none of":
        // 检查数组不包含任何指定值
        return {
          query: `NOT ARRAY_OVERLAP(${fieldRef}, [${valuesList}])`,
          params: {},
        };
      default:
        throw new Error(`Unsupported operator: ${this.operator}`);
    }
  }
}

export class StringObjectFilter implements Filter {
  public table: string;
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
    this.table = opts.clickhouseTable;
    this.field = opts.field;
    this.value = opts.value;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
    this.key = opts.key;
  }

  apply(): DbFilter {
    const column = `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}`;
    const escapedKey = this.key.replace(/'/g, "''");
    const escapedValue = this.value.replace(/'/g, "''");

    let query: string;
    switch (this.operator) {
      case "=":
        // 使用 Doris 的 MAP 访问语法
        query = `${column}['${escapedKey}'] = '${escapedValue}'`;
        break;
      case "contains":
        query = `INSTR(${column}['${escapedKey}'], '${escapedValue}') > 0`;
        break;
      case "does not contain":
        query = `INSTR(${column}['${escapedKey}'], '${escapedValue}') = 0`;
        break;
      case "starts with":
        query = `STARTS_WITH(${column}['${escapedKey}'], '${escapedValue}')`;
        break;
      case "ends with":
        query = `ENDS_WITH(${column}['${escapedKey}'], '${escapedValue}')`;
        break;
      default:
        throw new Error(`Unsupported operator: ${this.operator}`);
    }

    return {
      query,
      params: {},
    };
  }
}

export class NumberObjectFilter implements Filter {
  public table: string;
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
    this.table = opts.clickhouseTable;
    this.field = opts.field;
    this.value = opts.value;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
    this.key = opts.key;
  }

  apply(): DbFilter {
    const column = `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}`;
    const escapedKey = this.key.replace(/'/g, "''");
    
    // 使用 Doris 的 MAP 访问语法进行数字比较
    return {
      query: `CAST(${column}['${escapedKey}'] AS DECIMAL(20,6)) ${this.operator} ${this.value}`,
      params: {},
    };
  }
}

// export class FilterList {
//   private filters: Filter[];
//
//   constructor(filters: Filter[] = []) {
//     this.filters = filters;
//   }
//
//   push(...filter: Filter[]) {
//     this.filters.push(...filter);
//   }
//
//   find(predicate: (filter: Filter) => boolean) {
//     return this.filters.find(predicate);
//   }
//
//   filter(predicate: (filter: Filter) => boolean) {
//     return new FilterList(this.filters.filter(predicate));
//   }
//
//   some(predicate: (filter: Filter) => boolean) {
//     return this.filters.some(predicate);
//   }
//
//   forEach(callback: (filter: Filter) => void) {
//     this.filters.forEach(callback);
//   }
//
//   length() {
//     return this.filters.length;
//   }
//
//   public apply(): DbFilter {
//     if (this.filters.length === 0) {
//       return {
//         query: "",
//         params: {},
//       };
//     }
//     const compiledQueries = this.filters.map((filter) => filter.apply());
//     const { params, queries } = compiledQueries.reduce(
//       (acc, { params, query }) => {
//         acc.params = { ...acc.params, ...params };
//         acc.queries.push(query);
//         return acc;
//       },
//       { params: {}, queries: [] as string[] },
//     );
//     return {
//       query: queries.join(" AND "),
//       params,
//     };
//   }
// }