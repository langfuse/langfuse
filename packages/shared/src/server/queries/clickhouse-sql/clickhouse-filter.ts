import {
  FTS_MATCH_OPERATOR,
  type FtsMatchOperator,
  filterOperators,
} from "../../../interfaces/filters";
import { convertDateToClickhouseDateTime } from "../../clickhouse/client";
import { clickhouseCompliantRandomCharacters } from "../../repositories";
import { escapeSqlLikePattern } from "../../utils/sqlLike";
import {
  assertValidFtsMatchFilter,
  FTS_OPERATOR_DESCRIPTORS,
  isFtsEventsTable,
  isFtsMetadataField,
  isFtsTextField,
  isFtsTextTarget,
} from "./fts";

export type ClickhouseOperator =
  | (typeof filterOperators)[keyof typeof filterOperators][number]
  | "!="
  | FtsMatchOperator;
export interface Filter {
  apply(): ClickhouseFilter;
  clickhouseTable: string;
  tablePrefix?: string;
  operator: ClickhouseOperator;
  field: string;
}
export type ClickhouseFilter = {
  query: string;
  params: { [x: string]: any } | {};
};

const NGRAM_ACCELERATED_METADATA_OPERATORS = new Set<
  (typeof filterOperators)["stringObject"][number]
>(["contains", "starts with", "ends with"]);

export class StringFilter implements Filter {
  public clickhouseTable: string;
  public field: string;
  public value: string;
  public operator:
    | (typeof filterOperators)["string"][number]
    | FtsMatchOperator;
  public tablePrefix?: string;
  public emptyEqualsNull?: boolean;

  constructor(opts: {
    clickhouseTable: string;
    field: string;
    operator: (typeof filterOperators)["string"][number] | FtsMatchOperator;
    value: string;
    tablePrefix?: string;
    emptyEqualsNull?: boolean;
  }) {
    this.clickhouseTable = opts.clickhouseTable;
    this.field = opts.field;
    this.value = opts.value;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
    this.emptyEqualsNull = opts.emptyEqualsNull;
  }

  apply(): ClickhouseFilter {
    const varName = `stringFilter${clickhouseCompliantRandomCharacters()}`;

    const fieldWithPrefix = `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}`;

    // '' ≡ NULL: when filtering with empty value, match both '' and NULL.
    // ClickHouse functions like startsWith/endsWith/position return NULL (not true)
    // for NULL inputs, so we need an explicit OR IS NULL guard.
    if (this.emptyEqualsNull && this.value === "") {
      if (
        this.operator === "=" ||
        this.operator === "contains" ||
        this.operator === "starts with" ||
        this.operator === "ends with"
      ) {
        return {
          query: `(${fieldWithPrefix} = '' OR ${fieldWithPrefix} IS NULL)`,
          params: {},
        };
      }
    }

    let query: string;
    switch (this.operator) {
      case "=":
        query = `${fieldWithPrefix} = {${varName}: String}`;
        if (isFtsTextTarget(this.clickhouseTable, this.field, this.operator)) {
          query = FTS_OPERATOR_DESCRIPTORS["="].textCondition(
            fieldWithPrefix,
            `{${varName}: String}`,
            query,
          );
        }
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
      case "is not empty":
        query = `(${fieldWithPrefix} != '' AND ${fieldWithPrefix} IS NOT NULL)`;
        break;
      case FTS_MATCH_OPERATOR:
        assertValidFtsMatchFilter({
          filterType: "string",
          clickhouseTable: this.clickhouseTable,
          field: this.field,
          value: this.value,
        });
        query = FTS_OPERATOR_DESCRIPTORS[FTS_MATCH_OPERATOR].textCondition(
          fieldWithPrefix,
          `{${varName}: String}`,
          // `matches` shares the descriptor signature with exact filters but
          // does not need a base exact predicate.
          "",
        );
        break;
      default:
        throw new Error(`Unsupported operator: ${this.operator}`);
    }

    // '' ≡ NULL: "does not contain" would match '' — guard against it
    if (this.emptyEqualsNull && this.operator === "does not contain") {
      query = `(${fieldWithPrefix} != '' AND ${query})`;
    }

    return {
      query,
      params: this.operator === "is not empty" ? {} : { [varName]: this.value },
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
    const uid = clickhouseCompliantRandomCharacters();
    const varName = `numberFilter${uid}`;
    const type = this.clickhouseTypeOverwrite ?? "Decimal64(12)";
    return {
      query: `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field} ${this.operator} {${varName}: ${type}}`,
      params: { [varName]: this.value.toString() },
    };
  }
}

export const bindUtcDateTimeParam = (name: string, value: Date) => ({
  placeholder: `{${name}: DateTime64(3, 'UTC')}`,
  value: convertDateToClickhouseDateTime(value),
});

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
    const uid = clickhouseCompliantRandomCharacters();
    const varName = `dateTimeFilter${uid}`;
    const dateTimeParam = bindUtcDateTimeParam(varName, new Date(this.value));
    // Use ClickHouse DateTime string encoding rather than epoch millis.
    // ClickHouse rejects query parameter value 0 for DateTime64(3), which is
    // exactly what Date#getTime() returns for 1970-01-01T00:00:00.000Z. The
    // converter emits UTC calendar time, so declare UTC explicitly rather than
    // relying on the ClickHouse server or session timezone.
    return {
      query: `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field} ${this.operator} ${dateTimeParam.placeholder}`,
      params: {
        [varName]: dateTimeParam.value,
      },
    };
  }
}

export class StringOptionsFilter implements Filter {
  public clickhouseTable: string;
  public field: string;
  public values: string[];
  public operator: (typeof filterOperators.stringOptions)[number];
  public tablePrefix?: string;
  public emptyEqualsNull?: boolean;

  constructor(opts: {
    clickhouseTable: string;
    field: string;
    operator: (typeof filterOperators.stringOptions)[number];
    values: string[];
    tablePrefix?: string;
    emptyEqualsNull?: boolean;
  }) {
    this.clickhouseTable = opts.clickhouseTable;
    this.field = opts.field;
    this.values = opts.values;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
    this.emptyEqualsNull = opts.emptyEqualsNull;
  }

  apply(): ClickhouseFilter {
    const uid = clickhouseCompliantRandomCharacters();
    const varName = `stringOptionsFilter${uid}`;
    const fieldWithPrefix = `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}`;
    const hasEmpty = this.emptyEqualsNull && this.values.includes("");

    let query =
      this.operator === "any of"
        ? `${fieldWithPrefix} IN ({${varName}: Array(String)})`
        : `${fieldWithPrefix} NOT IN ({${varName}: Array(String)})`;

    if (hasEmpty && this.operator === "any of") {
      // '' ≡ NULL: also match NULL when '' is in the list
      query = `(${query} OR ${fieldWithPrefix} IS NULL)`;
    } else if (this.emptyEqualsNull && this.operator === "none of") {
      // '' ≡ NULL: exclude empty/null (which are equivalent)
      const guard = hasEmpty
        ? `${fieldWithPrefix} IS NOT NULL`
        : `${fieldWithPrefix} != ''`;
      query = `(${query} AND ${guard})`;
    }

    return {
      query,
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
    const uid = clickhouseCompliantRandomCharacters();
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
// For observations/traces tables: uses Map column (metadata)
// For events tables (events_core, events_full): uses Array columns (metadata_names/metadata_values)
// We can only filter efficiently on the first level of a json obj.
export class StringObjectFilter implements Filter {
  public clickhouseTable: string;
  public field: string;
  public key: string;
  public value: string;
  public operator:
    | (typeof filterOperators)["stringObject"][number]
    | FtsMatchOperator;
  public tablePrefix?: string;

  constructor(opts: {
    clickhouseTable: string;
    field: string;
    operator:
      | (typeof filterOperators)["stringObject"][number]
      | FtsMatchOperator;
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
    const prefix = this.tablePrefix ? this.tablePrefix + "." : "";

    // Events tables use array columns (metadata_names/metadata_values);
    // observations/traces tables use a Map column (metadata).
    let query: string;
    if (isFtsEventsTable(this.clickhouseTable)) {
      // ClickHouse's index analyzer cannot extract `has(names, k)` from
      // `values[indexOf(names, k)] OP v` (cross-array arrayElement form), so a
      // bloom_filter skipping index on `names` would never prune granules.
      // Emitting an explicit `has(names, k) AND (...)` prefix conjunct makes
      // the index actionable and corrects the absent-key matching semantic
      // (Otherwise `arr[0] = ''` causes some predicates to match rows that never
      // had the key — including `does not contain`).
      const namesColumn = `${prefix}${this.field}_names`;
      const valuesColumn = `${prefix}${this.field}_values`;
      const valueAccessor = `${valuesColumn}[indexOf(${namesColumn}, {${varKeyName}: String})]`;
      const hasKey = `has(${namesColumn}, {${varKeyName}: String})`;
      const valueParam = `{${varValueName}: String}`;
      const ngramPrefilterParamName = `stringObjectNgramFilter${clickhouseCompliantRandomCharacters()}`;
      const shouldUseNgramPrefilter =
        this.operator !== FTS_MATCH_OPERATOR &&
        isFtsMetadataField(this.field) &&
        NGRAM_ACCELERATED_METADATA_OPERATORS.has(this.operator) &&
        this.value.length > 0;
      const ngramPrefilter = shouldUseNgramPrefilter
        ? `like(arrayStringConcat(${valuesColumn}), {${ngramPrefilterParamName}: String})`
        : undefined;
      const ngramConjunct = ngramPrefilter ? ` AND ${ngramPrefilter}` : "";

      switch (this.operator) {
        case "=":
          query = FTS_OPERATOR_DESCRIPTORS["="].metadataArrayCondition({
            hasKey,
            valuesColumn,
            valueAccessor,
            valueParam,
          });
          break;
        case "contains":
          query = `${hasKey}${ngramConjunct} AND (position(${valueAccessor}, ${valueParam}) > 0)`;
          break;
        case "does not contain":
          query = `${hasKey} AND (position(${valueAccessor}, ${valueParam}) = 0)`;
          break;
        case "starts with":
          query = `${hasKey}${ngramConjunct} AND (startsWith(${valueAccessor}, ${valueParam}))`;
          break;
        case "ends with":
          query = `${hasKey}${ngramConjunct} AND (endsWith(${valueAccessor}, ${valueParam}))`;
          break;
        case FTS_MATCH_OPERATOR:
          assertValidFtsMatchFilter({
            filterType: "stringObject",
            clickhouseTable: this.clickhouseTable,
            field: this.field,
            value: this.value,
          });
          query = FTS_OPERATOR_DESCRIPTORS[
            FTS_MATCH_OPERATOR
          ].metadataArrayCondition({
            hasKey,
            valuesColumn,
            valueAccessor,
            valueParam,
          });
          break;
        default:
          throw new Error(`Unsupported operator: ${this.operator}`);
      }

      if (ngramPrefilter) {
        return {
          query,
          params: {
            [varKeyName]: this.key,
            [varValueName]: this.value,
            [ngramPrefilterParamName]: `%${escapeSqlLikePattern(this.value)}%`,
          },
        };
      }
    } else {
      // For observations/traces tables, use Map access: metadata[key]
      const column = `${prefix}${this.field}`;
      const valueAccessor = `${column}[{${varKeyName}: String}]`;
      // A missing key resolves the Map access to the empty-string default,
      // which would otherwise make `contains ""` (and every other operator's
      // empty-value comparison) incorrectly match rows that never had the
      // key. Require the key to exist first, mirroring the events-table fix
      // in PR #13369.
      const hasKey = `mapContains(${column}, {${varKeyName}: String})`;

      switch (this.operator) {
        case "=":
          query = `${hasKey} AND (${valueAccessor} = {${varValueName}: String})`;
          break;
        case "contains":
          query = `${hasKey} AND (position(${valueAccessor}, {${varValueName}: String}) > 0)`;
          break;
        case "does not contain":
          query = `${hasKey} AND (position(${valueAccessor}, {${varValueName}: String}) = 0)`;
          break;
        case "starts with":
          query = `${hasKey} AND (startsWith(${valueAccessor}, {${varValueName}: String}))`;
          break;
        case "ends with":
          query = `${hasKey} AND (endsWith(${valueAccessor}, {${varValueName}: String}))`;
          break;
        default:
          throw new Error(`Unsupported operator: ${this.operator}`);
      }
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
  public tablePrefix?: string;
  public emptyEqualsNull?: boolean;

  constructor(opts: {
    clickhouseTable: string;
    field: string;
    operator: (typeof filterOperators)["null"][number];
    tablePrefix?: string;
    emptyEqualsNull?: boolean;
  }) {
    this.clickhouseTable = opts.clickhouseTable;
    this.field = opts.field;
    this.operator = opts.operator;
    this.tablePrefix = opts.tablePrefix;
    this.emptyEqualsNull = opts.emptyEqualsNull;
  }

  apply(): ClickhouseFilter {
    const fieldWithPrefix = `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}`;

    // '' ≡ NULL: treat empty string and NULL as the same value
    if (this.emptyEqualsNull) {
      const isNull = this.operator === "is null";
      return {
        query: isNull
          ? `(${fieldWithPrefix} = '' OR ${fieldWithPrefix} IS NULL)`
          : `(${fieldWithPrefix} != '' AND ${fieldWithPrefix} IS NOT NULL)`,
        params: {},
      };
    }

    return {
      query: `${fieldWithPrefix} ${this.operator}`,
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
    const varKeyName = `numberObjectKeyFilter${clickhouseCompliantRandomCharacters()}`;
    const varValueName = `numberObjectValueFilter${clickhouseCompliantRandomCharacters()}`;
    const column = `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}`;
    return {
      query: `empty(arrayFilter(x -> (((x.1) = {${varKeyName}: String}) AND ((x.2) ${this.operator} {${varValueName}: Decimal64(12)})), ${column})) = 0`,
      params: { [varKeyName]: this.key, [varValueName]: this.value },
    };
  }
}

/**
 * Encodes one boolean-score entry the way the `score_booleans` ClickHouse
 * aggregation stores it (`scoreBooleansAggregation` in query-fragments.ts:
 * `concat(name, ':', lowerUTF8(string_value))`). BooleanObjectFilter and
 * InMemoryFilterService must build lookup targets through this helper so the
 * two filter paths and the SQL producer cannot drift apart.
 */
export const encodeBooleanScoreEntry = (key: string, value: boolean): string =>
  `${key}:${value ? "true" : "false"}`;

export class BooleanObjectFilter implements Filter {
  public clickhouseTable: string;
  public field: string;
  public key: string;
  public value: boolean;
  public operator: (typeof filterOperators)["booleanObject"][number];
  public tablePrefix?: string;

  constructor(opts: {
    clickhouseTable: string;
    field: string;
    operator: (typeof filterOperators)["booleanObject"][number];
    key: string;
    value: boolean;
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
    const uid = clickhouseCompliantRandomCharacters();
    const varName = `booleanObjectFilter${uid}`;
    const column = `${this.tablePrefix ? this.tablePrefix + "." : ""}${this.field}`;
    const value = encodeBooleanScoreEntry(this.key, this.value);
    const predicate = `has(${column}, {${varName}: String})`;

    return {
      query: this.operator === "<>" ? `NOT ${predicate}` : predicate,
      params: { [varName]: value },
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

// events_core_mv truncates each metadata_values element (and input/output) to
// the first 200 UTF-8 code points via leftUTF8(v, 200). A metadata filter is
// only safe to answer against events_core when 200-char truncation cannot
// change its result.
const EVENTS_CORE_TRUNCATION_LIMIT = 200;

// Metadata operators that can be answered correctly against the truncated
// events_core copy — an allow-list, so any operator not named here defaults to
// events_full. That default is the safe one: routing a decidable filter to
// events_full only costs performance, whereas routing a truncation-sensitive
// filter to events_core silently drops matches past code point 200. When a new
// ClickhouseOperator is added it must be reviewed and added here explicitly
// before it can use events_core.
//   - `=` / `starts with`: string ops, subject to the length guard below.
//   - `>` `<` `>=` `<=`: numeric comparisons — values are inherently short.
//   - `<>`: boolean not-equal — value is inherently short.
//   - `is null` / `is not null`: truncation-invariant (metadata_names is not
//     truncated; emptiness is unaffected).
// Deliberately excluded (match can live past code point 200): `contains`,
// `does not contain`, `ends with`, and the FTS `matches` operator (which also
// needs the events_full-only index).
const EVENTS_CORE_SAFE_METADATA_OPERATORS = new Set<ClickhouseOperator>([
  "=",
  "starts with",
  ">",
  "<",
  ">=",
  "<=",
  "<>",
  "is null",
  "is not null",
]);

// Count Unicode code points to mirror ClickHouse leftUTF8, which truncates by
// code point rather than UTF-16 unit or byte.
const codePointLength = (value: string): number => Array.from(value).length;

/**
 * Truncation-safety classifier: can a single metadata filter be answered
 * correctly against the truncated events_core copy, or must it read events_full?
 *
 * events_core keeps only the first {@link EVENTS_CORE_TRUNCATION_LIMIT} code
 * points of each metadata value (metadata_names is not truncated). This is an
 * allow-list: an operator is events_core-safe only if it is named in
 * {@link EVENTS_CORE_SAFE_METADATA_OPERATORS} and, for the two length-sensitive
 * string operators, its value fits within the retained prefix:
 *   - `starts with`, value length <= 200 — the prefix lives within retained chars.
 *   - `=`, value length < 200 — a stored value longer than 200 truncates to 200
 *     code points and can never equal a sub-200 value. Strict `<` avoids the
 *     exact-200 false positive where a >200 value shares the first 200 chars.
 *   - `is null` / `is not null` — truncation invariant (metadata_names is
 *     untruncated; emptiness is unaffected).
 *   - numeric / boolean metadata comparisons — the value is inherently short,
 *     so its truncated copy is complete.
 * Anything else (including any newly added operator) is routed to events_full,
 * because over-routing only costs performance while under-routing silently
 * drops matches past the truncation boundary.
 *
 * Single source of truth for metadata truncation routing. Do not reuse
 * NGRAM_ACCELERATED_METADATA_OPERATORS or FTS_TEXT_OPERATORS: those classify
 * ngram/FTS index eligibility, a different axis (the ngram set includes
 * truncation-unsafe `contains`/`ends with` and excludes truncation-safe `=`).
 */
export const metadataFilterIsEventsCoreSafe = (
  operator: ClickhouseOperator,
  value: unknown,
): boolean => {
  if (!EVENTS_CORE_SAFE_METADATA_OPERATORS.has(operator)) {
    return false;
  }
  if (typeof value === "string") {
    if (operator === "starts with") {
      return codePointLength(value) <= EVENTS_CORE_TRUNCATION_LIMIT;
    }
    if (operator === "=") {
      return codePointLength(value) < EVENTS_CORE_TRUNCATION_LIMIT;
    }
  }
  return true;
};

// events_core stores input/output/metadata_values truncated to 200 chars
// (events_core_mv). A filter must read events_full when truncation could change
// its result: input/output always (truncated, and events_core lacks the I/O FTS
// indices); metadata only when the operator/value is truncation-sensitive.
const filterRequiresEventsFull = (filter: Filter): boolean => {
  if (!isFtsEventsTable(filter.clickhouseTable)) {
    return false;
  }
  if (isFtsTextField(filter.field)) {
    return true;
  }
  if (isFtsMetadataField(filter.field)) {
    const value =
      "value" in filter ? (filter as { value: unknown }).value : undefined;
    return !metadataFilterIsEventsCoreSafe(filter.operator, value);
  }
  return false;
};

export const filtersRequireEventsFull = (filters: FilterList): boolean =>
  filters.some(filterRequiresEventsFull);
