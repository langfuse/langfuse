import { filterOperators } from "../../interfaces/filters";
import { type TracingSearchType } from "../../interfaces/search";
import {
  findUiColumnMapping,
  type UiColumnMatchable,
} from "../../tableDefinitions/types";
import { type EventsTableFilterState, type TimeFilter } from "../../types";

/**
 * Which table a select-all trace delete reads its filter against. Mirrors
 * `TraceDeleteBatchActionConfig.source`: the legacy traces table yields one
 * row per trace, the events table one row per observation, and a trace is
 * deleted when any of its observations matches.
 */
export type TraceDeletePredicateSource = "traces" | "events";

const TRACE_DELETE_CUTOFF_COLUMN: Record<TraceDeletePredicateSource, string> = {
  traces: "timestamp",
  events: "startTime",
};

/**
 * The bound a select-all trace delete adds to the stored filter. Rows at or
 * after the cutoff are never deleted by that batch action.
 */
export const traceDeleteCutoffFilter = (
  source: TraceDeletePredicateSource,
  cutoffCreatedAt: Date,
): TimeFilter => ({
  column: TRACE_DELETE_CUTOFF_COLUMN[source],
  operator: "<",
  value: cutoffCreatedAt,
  type: "datetime",
});

/**
 * How a column is stored, which decides SQL NULL handling:
 * - `string`: non-nullable String; the API may surface `''` as null.
 * - `nullableString`: Nullable(String); null is SQL NULL.
 * - `nullIfEmptyString`: a nullable expression that never yields `''`.
 */
type TraceDeletePredicateColumnKind =
  | "string"
  | "nullableString"
  | "nullIfEmptyString"
  | "datetime"
  | "stringArray"
  | "boolean";

export type TraceDeletePredicateColumn = UiColumnMatchable &
  Readonly<{
    kind: TraceDeletePredicateColumnKind;
    emptyEqualsNull?: boolean;
  }>;

/**
 * Columns whose filter can be evaluated in memory with the same result as the
 * ClickHouse filter: each maps to one stored column that list rows return
 * verbatim. Identifiers match the server UI column mappings for the source;
 * aggregates, scores, metadata, and computed columns are left out.
 */
export const TRACE_DELETE_PREDICATE_COLUMNS: Record<
  TraceDeletePredicateSource,
  readonly TraceDeletePredicateColumn[]
> = {
  traces: [
    { uiTableName: "⭐️", uiTableId: "bookmarked", kind: "boolean" },
    { uiTableName: "ID", uiTableId: "id", kind: "string" },
    { uiTableName: "Trace ID", uiTableId: "traceId", kind: "string" },
    { uiTableName: "Name", uiTableId: "name", kind: "string" },
    { uiTableName: "Trace Name", uiTableId: "traceName", kind: "string" },
    { uiTableName: "Timestamp", uiTableId: "timestamp", kind: "datetime" },
    { uiTableName: "User ID", uiTableId: "userId", kind: "nullableString" },
    {
      uiTableName: "Session ID",
      uiTableId: "sessionId",
      kind: "nullableString",
    },
    { uiTableName: "Version", uiTableId: "version", kind: "nullableString" },
    { uiTableName: "Release", uiTableId: "release", kind: "nullableString" },
    { uiTableName: "Environment", uiTableId: "environment", kind: "string" },
    { uiTableName: "Tags", uiTableId: "tags", kind: "stringArray" },
    { uiTableName: "Trace Tags", uiTableId: "traceTags", kind: "stringArray" },
  ],
  events: [
    { uiTableName: "Environment", uiTableId: "environment", kind: "string" },
    { uiTableName: "Type", uiTableId: "type", kind: "string" },
    { uiTableName: "ID", uiTableId: "id", kind: "string" },
    { uiTableName: "Name", uiTableId: "name", kind: "string" },
    { uiTableName: "Trace ID", uiTableId: "traceId", kind: "string" },
    { uiTableName: "Start Time", uiTableId: "startTime", kind: "datetime" },
    {
      uiTableName: "Status",
      uiTableId: "level",
      aliases: ["Level"],
      kind: "string",
    },
    {
      uiTableName: "Provided Model Name",
      uiTableId: "providedModelName",
      kind: "string",
    },
    { uiTableName: "Version", uiTableId: "version", kind: "string" },
    {
      uiTableName: "Release",
      uiTableId: "release",
      kind: "string",
      emptyEqualsNull: true,
    },
    { uiTableName: "Prompt Name", uiTableId: "promptName", kind: "string" },
    { uiTableName: "Session ID", uiTableId: "sessionId", kind: "string" },
    {
      uiTableName: "Trace Name",
      uiTableId: "traceName",
      kind: "nullIfEmptyString",
    },
    { uiTableName: "User ID", uiTableId: "userId", kind: "string" },
    { uiTableName: "Trace Tags", uiTableId: "traceTags", kind: "stringArray" },
    { uiTableName: "Tags", uiTableId: "tags", kind: "stringArray" },
    {
      uiTableName: "Trace Environment",
      uiTableId: "traceEnvironment",
      kind: "string",
    },
    {
      uiTableName: "Parent Observation ID",
      uiTableId: "parentObservationId",
      kind: "string",
      emptyEqualsNull: true,
    },
  ],
};

/**
 * One row the predicate is evaluated against, keyed by column `uiTableId`. A
 * missing key means the value was not loaded; such a row never matches.
 */
export type TraceDeleteCandidate = Readonly<
  { traceId: string } & Record<string, unknown>
>;

export type TraceDeletePredicate = {
  source: TraceDeletePredicateSource;
  filter: EventsTableFilterState;
  searchQuery?: string | null;
  searchType?: readonly TracingSearchType[];
  cutoffCreatedAt: Date;
};

export type CompiledTraceDeletePredicate =
  | {
      supported: true;
      source: TraceDeletePredicateSource;
      matches: (candidate: TraceDeleteCandidate) => boolean;
    }
  | { supported: false; source: TraceDeletePredicateSource; reason: string };

type SqlString = string | null;
type ConditionTest = (candidate: TraceDeleteCandidate) => boolean;

const STRING_OPERATORS: ReadonlySet<string> = new Set(filterOperators.string);

const readSqlString = (
  value: unknown,
  kind: TraceDeletePredicateColumnKind,
): SqlString | undefined => {
  if (value !== null && value !== undefined && typeof value !== "string") {
    return undefined;
  }
  const text = value ?? null;
  if (kind === "string") return text ?? "";
  if (kind === "nullIfEmptyString") return text === "" ? null : text;
  return text;
};

const compileString = (
  column: TraceDeletePredicateColumn,
  operator: string,
  value: string,
): ((v: SqlString) => boolean) | null => {
  if (!STRING_OPERATORS.has(operator)) return null;
  if (
    column.emptyEqualsNull &&
    value === "" &&
    (operator === "=" ||
      operator === "contains" ||
      operator === "starts with" ||
      operator === "ends with")
  ) {
    return (v) => v === "" || v === null;
  }
  const base = ((): ((v: string) => boolean) => {
    switch (operator) {
      case "=":
        return (v) => v === value;
      case "contains":
        return (v) => v.includes(value);
      case "does not contain":
        return (v) => !v.includes(value);
      case "starts with":
        return (v) => v.startsWith(value);
      case "ends with":
        return (v) => v.endsWith(value);
      default:
        return (v) => v !== "";
    }
  })();
  if (column.emptyEqualsNull && operator === "does not contain") {
    return (v) => v !== null && v !== "" && base(v);
  }
  return (v) => v !== null && base(v);
};

const compileStringOptions = (
  column: TraceDeletePredicateColumn,
  operator: string,
  values: readonly string[],
): ((v: SqlString) => boolean) | null => {
  const set = new Set(values);
  const hasEmpty = column.emptyEqualsNull === true && set.has("");
  if (operator === "any of") {
    return hasEmpty
      ? (v) => v === null || set.has(v)
      : (v) => v !== null && set.has(v);
  }
  if (operator === "none of") {
    if (column.emptyEqualsNull) {
      return hasEmpty
        ? (v) => v !== null && !set.has(v)
        : (v) => v !== null && v !== "" && !set.has(v);
    }
    return (v) => v !== null && !set.has(v);
  }
  return null;
};

const compileNull = (
  column: TraceDeletePredicateColumn,
  operator: string,
): ((v: SqlString) => boolean) | null => {
  const isNull = column.emptyEqualsNull
    ? (v: SqlString) => v === null || v === ""
    : (v: SqlString) => v === null;
  if (operator === "is null") return isNull;
  if (operator === "is not null") return (v) => !isNull(v);
  return null;
};

const compileDateTime = (
  operator: string,
  value: unknown,
): ((v: number) => boolean) | null => {
  const bound =
    value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  if (!Number.isFinite(bound)) return null;
  switch (operator) {
    case ">":
      return (v) => v > bound;
    case "<":
      return (v) => v < bound;
    case ">=":
      return (v) => v >= bound;
    case "<=":
      return (v) => v <= bound;
    default:
      return null;
  }
};

const compileArrayOptions = (
  operator: string,
  values: readonly string[],
): ((v: readonly unknown[]) => boolean) | null => {
  switch (operator) {
    case "any of":
      return (v) => v.some((item) => values.includes(String(item)));
    case "none of":
      return (v) => !v.some((item) => values.includes(String(item)));
    case "all of":
      return (v) => values.every((item) => v.some((x) => String(x) === item));
    default:
      return null;
  }
};

const compileStringColumnCondition = (
  column: TraceDeletePredicateColumn,
  condition: EventsTableFilterState[number],
): ((v: SqlString) => boolean) | null => {
  switch (condition.type) {
    case "string":
      return compileString(column, condition.operator, condition.value);
    case "stringOptions":
      return compileStringOptions(column, condition.operator, condition.value);
    case "null":
      return compileNull(column, condition.operator);
    default:
      return null;
  }
};

const compileCondition = (
  condition: EventsTableFilterState[number],
  columns: readonly TraceDeletePredicateColumn[],
): ConditionTest | string => {
  const column = findUiColumnMapping(columns, condition.column);
  if (!column) return `column "${condition.column}" is not evaluated locally`;
  const id = column.uiTableId;

  const unsupported = `filter "${condition.type} ${condition.operator}" on "${condition.column}" is not evaluated locally`;

  switch (column.kind) {
    case "string":
    case "nullableString":
    case "nullIfEmptyString": {
      const test = compileStringColumnCondition(column, condition);
      if (!test) return unsupported;
      const kind = column.kind;
      return (candidate) => {
        if (!(id in candidate)) return false;
        const v = readSqlString(candidate[id], kind);
        return v !== undefined && test(v);
      };
    }
    case "datetime": {
      if (condition.type !== "datetime") return unsupported;
      const test = compileDateTime(condition.operator, condition.value);
      if (!test) return unsupported;
      return (candidate) => {
        const v = candidate[id];
        return v instanceof Date && test(v.getTime());
      };
    }
    case "stringArray": {
      if (condition.type !== "arrayOptions") return unsupported;
      const test = compileArrayOptions(condition.operator, condition.value);
      if (!test) return unsupported;
      return (candidate) => {
        const v = candidate[id];
        return Array.isArray(v) && test(v);
      };
    }
    case "boolean": {
      if (condition.type !== "boolean") return unsupported;
      const expected = condition.value;
      const equal = condition.operator === "=";
      if (!equal && condition.operator !== "<>") return unsupported;
      return (candidate) => {
        const v = candidate[id];
        return typeof v === "boolean" && (v === expected) === equal;
      };
    }
  }
};

/**
 * Compiles a stored select-all trace delete into an in-memory test that agrees
 * with how the batch action resolves trace ids: the stored filter plus the
 * cutoff bound, with ClickHouse NULL and empty-string semantics per column.
 * Anything that cannot be evaluated with the same result (free-text search,
 * scores, aggregates, metadata, position in trace) makes the whole predicate
 * unsupported rather than approximated.
 */
export const compileTraceDeletePredicate = (
  predicate: TraceDeletePredicate,
): CompiledTraceDeletePredicate => {
  const { source } = predicate;
  if (predicate.searchQuery) {
    return {
      supported: false,
      source,
      reason: "free-text search is not evaluated locally",
    };
  }

  const columns = TRACE_DELETE_PREDICATE_COLUMNS[source];
  const conditions = [
    ...predicate.filter,
    traceDeleteCutoffFilter(source, predicate.cutoffCreatedAt),
  ];
  const tests: ConditionTest[] = [];
  for (const condition of conditions) {
    const compiled = compileCondition(condition, columns);
    if (typeof compiled === "string") {
      return { supported: false, source, reason: compiled };
    }
    tests.push(compiled);
  }

  return {
    supported: true,
    source,
    matches: (candidate) => tests.every((test) => test(candidate)),
  };
};
