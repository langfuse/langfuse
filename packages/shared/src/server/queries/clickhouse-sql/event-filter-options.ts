import { InvalidRequestError } from "../../../errors";
import {
  eventsTableCols,
  eventsTableHasParentObservationSql,
  eventsTableIsRootObservationSql,
} from "../../../eventsTable";
import type { FilterState } from "../../../types";
import { eventsTableUiColumnDefinitions } from "../../tableMappings/mapEventsTable";
import { FilterList } from "./clickhouse-filter";
import { EventsAggQueryBuilder } from "./event-query-builder";
import {
  buildEventsObservationRowSelection,
  groupEventsObservationFilters,
} from "./events-observation-row-selection";
import { createFilterFromFilterState } from "./factory";

export const EVENTS_FILTER_OPTION_TOP_N = 1000;

// Sentinel "column" under which the bulk filter-options query returns the
// approximate total observation count (its `count` field). Rides the facet
// scan so the traces-table footer "Total ≈ X" needs no extra ClickHouse scan.
export const EVENTS_APPROX_TOTAL_COUNT_MARKER = "__approxTotalCount__";

// Native (`e.*`) filter columns that still can't be inlined into the approx-
// count predicate: events_core stores input/output truncated, so filtering on
// them requires events_full. Dropping them flags the count "partial".
const NON_INLINEABLE_EVENT_FILTER_COLUMNS = new Set<string>([
  "input",
  "output",
  "Input",
  "Output",
]);
const EVENTS_FILTER_OPTION_TOP_K_MAX_N = 65_536;

type EventFilterOptionSort = "countDesc" | "alpha" | "booleanAsc";

type EventFilterOptionDefinition =
  | {
      kind: "scalar";
      expression: string;
      includeWhen: string;
      sort: EventFilterOptionSort;
    }
  | {
      kind: "array";
      expression: string;
      sort: EventFilterOptionSort;
      distinct?: boolean;
    }
  | {
      kind: "boolean";
      expression: string;
      sort: "booleanAsc";
    };

const EVENTS_FILTER_OPTION_DEFINITIONS = {
  providedModelName: {
    kind: "scalar",
    expression: "e.provided_model_name",
    includeWhen:
      "e.provided_model_name IS NOT NULL AND length(e.provided_model_name) > 0",
    sort: "countDesc",
  },
  modelId: {
    kind: "scalar",
    expression: "e.model_id",
    includeWhen: "e.model_id IS NOT NULL AND length(e.model_id) > 0",
    sort: "countDesc",
  },
  name: {
    kind: "scalar",
    expression: "e.name",
    includeWhen: "e.name IS NOT NULL AND length(e.name) > 0",
    sort: "countDesc",
  },
  traceName: {
    kind: "scalar",
    expression: "e.trace_name",
    includeWhen: "e.trace_name IS NOT NULL AND length(e.trace_name) > 0",
    sort: "countDesc",
  },
  type: {
    kind: "scalar",
    expression: "e.type",
    includeWhen: "e.type IS NOT NULL AND length(e.type) > 0",
    sort: "countDesc",
  },
  userId: {
    kind: "scalar",
    expression: "e.user_id",
    includeWhen: "e.user_id IS NOT NULL AND length(e.user_id) > 0",
    sort: "countDesc",
  },
  version: {
    kind: "scalar",
    expression: "e.version",
    includeWhen: "e.version IS NOT NULL AND length(e.version) > 0",
    sort: "countDesc",
  },
  sessionId: {
    kind: "scalar",
    expression: "e.session_id",
    includeWhen: "e.session_id IS NOT NULL AND length(e.session_id) > 0",
    sort: "countDesc",
  },
  level: {
    kind: "scalar",
    expression: "e.level",
    includeWhen: "e.level IS NOT NULL AND length(e.level) > 0",
    sort: "countDesc",
  },
  environment: {
    kind: "scalar",
    expression: "e.environment",
    includeWhen: "e.environment IS NOT NULL AND length(e.environment) > 0",
    sort: "countDesc",
  },
  promptName: {
    kind: "scalar",
    expression: "e.prompt_name",
    includeWhen:
      "e.type = 'GENERATION' AND e.prompt_name IS NOT NULL AND e.prompt_name != ''",
    sort: "countDesc",
  },
  traceTags: {
    kind: "array",
    expression: "e.tags",
    sort: "alpha",
    distinct: true,
  },
  experimentDatasetId: {
    kind: "scalar",
    expression: "e.experiment_dataset_id",
    includeWhen:
      "e.experiment_dataset_id IS NOT NULL AND length(e.experiment_dataset_id) > 0",
    sort: "countDesc",
  },
  experimentId: {
    kind: "scalar",
    expression: "e.experiment_id",
    includeWhen: "e.experiment_id IS NOT NULL AND length(e.experiment_id) > 0",
    sort: "countDesc",
  },
  experimentName: {
    kind: "scalar",
    expression: "e.experiment_name",
    includeWhen:
      "e.experiment_name IS NOT NULL AND length(e.experiment_name) > 0",
    sort: "countDesc",
  },
  isRootObservation: {
    kind: "boolean",
    expression: eventsTableIsRootObservationSql,
    sort: "booleanAsc",
  },
  hasParentObservation: {
    kind: "boolean",
    expression: eventsTableHasParentObservationSql,
    sort: "booleanAsc",
  },
  toolNames: {
    kind: "array",
    expression: "mapKeys(e.tool_definitions)",
    sort: "countDesc",
  },
  calledToolNames: {
    kind: "array",
    expression: "e.tool_call_names",
    sort: "countDesc",
  },
} satisfies Record<string, EventFilterOptionDefinition>;

export type EventFilterOptionColumn =
  keyof typeof EVENTS_FILTER_OPTION_DEFINITIONS;

export type EventFilterOptionRow = {
  column: EventFilterOptionColumn;
  value: string;
  count: number;
};

export type EventFilterOptionScope = "scoredTraces";

const EVENTS_FILTER_OPTION_COLUMN_IDENTIFIER_PATTERN = /^[A-Za-z]+$/;

const assertEventFilterOptionColumnSet = <T extends Record<string, unknown>>(
  definitions: T,
): ReadonlySet<Extract<keyof T, string>> => {
  const columns = Object.keys(definitions) as Array<Extract<keyof T, string>>;
  const invalidColumn = columns.find(
    (column) => !EVENTS_FILTER_OPTION_COLUMN_IDENTIFIER_PATTERN.test(column),
  );

  if (invalidColumn) {
    throw new Error(
      `Invalid events filter option column identifier: ${invalidColumn}`,
    );
  }

  return new Set(columns);
};

const EVENTS_FILTER_OPTION_COLUMN_SET = assertEventFilterOptionColumnSet(
  EVENTS_FILTER_OPTION_DEFINITIONS,
);

const isEventFilterOptionColumn = (
  column: unknown,
): column is EventFilterOptionColumn =>
  typeof column === "string" &&
  EVENTS_FILTER_OPTION_COLUMN_SET.has(column as EventFilterOptionColumn);

export const normalizeEventFilterOptionColumn = (
  column: unknown,
): EventFilterOptionColumn => {
  if (!isEventFilterOptionColumn(column)) {
    throw new InvalidRequestError(
      `Unsupported events filter option column: ${String(column)}`,
    );
  }

  return column;
};

const uniqueEventFilterOptionColumns = (
  columns: readonly EventFilterOptionColumn[],
) => Array.from(new Set(columns.map(normalizeEventFilterOptionColumn)));

const eventFilterOptionColumnSqlLiteral = (column: EventFilterOptionColumn) =>
  `'${column}'`;

const stringValueExpression = (expression: string) =>
  `toString(ifNull(${expression}, ''))`;

const optionValuesArrayExpression = (
  column: EventFilterOptionColumn,
): string => {
  const definition = EVENTS_FILTER_OPTION_DEFINITIONS[column];

  if (definition.kind === "scalar") {
    return `if(${definition.includeWhen}, [${stringValueExpression(definition.expression)}], CAST([], 'Array(String)'))`;
  }

  if (definition.kind === "boolean") {
    return `[if(${definition.expression}, 'true', 'false')]`;
  }

  const valuesExpression =
    "distinct" in definition && definition.distinct
      ? `arrayDistinct(${definition.expression})`
      : definition.expression;

  return `arrayMap(value -> toString(value), arrayFilter(value -> length(toString(value)) > 0, ${valuesExpression}))`;
};

const optionPresenceCondition = (column: EventFilterOptionColumn): string => {
  const definition = EVENTS_FILTER_OPTION_DEFINITIONS[column];

  if (definition.kind === "scalar") {
    return definition.includeWhen;
  }

  if (definition.kind === "boolean") {
    return "1";
  }

  return `length(${definition.expression}) > 0`;
};

const singleColumnOrderBy = (column: EventFilterOptionColumn): string => {
  const definition = EVENTS_FILTER_OPTION_DEFINITIONS[column];

  if (definition.sort === "countDesc") {
    return "ORDER BY count() DESC, value ASC";
  }

  return "ORDER BY value ASC";
};

const optionTopAlias = (column: EventFilterOptionColumn) =>
  `${column}TopOptions`;

const optionTopKSelectExpression = (column: EventFilterOptionColumn) => {
  const definition = EVENTS_FILTER_OPTION_DEFINITIONS[column];

  if (definition.kind === "scalar") {
    return `approx_top_kIf({optionLimit: UInt64})(${stringValueExpression(definition.expression)}, ${definition.includeWhen}) AS ${optionTopAlias(column)}`;
  }

  if (definition.kind === "boolean") {
    return `arrayFilter(option -> tupleElement(option, 2) > 0, [tuple('false', countIf(NOT (${definition.expression})), toUInt64(0)), tuple('true', countIf(${definition.expression}), toUInt64(0))]) AS ${optionTopAlias(column)}`;
  }

  return `approx_top_kArray({optionLimit: UInt64})(${optionValuesArrayExpression(column)}) AS ${optionTopAlias(column)}`;
};

const optionRowsArrayExpression = (column: EventFilterOptionColumn) => {
  const definition = EVENTS_FILTER_OPTION_DEFINITIONS[column];
  const topAlias = optionTopAlias(column);
  // Alpha facets use a constant sort key; the final ORDER BY value tie-breaker
  // below provides alphabetical ordering within the top-k candidate set.
  const sortKeyExpression =
    definition.sort === "countDesc"
      ? "-toInt64(tupleElement(option, 2))"
      : definition.sort === "booleanAsc"
        ? "if(tupleElement(option, 1) = 'true', toInt64(1), toInt64(0))"
        : "toInt64(0)";

  return `arrayMap(option -> tuple(${eventFilterOptionColumnSqlLiteral(column)}, tupleElement(option, 1), tupleElement(option, 2), ${sortKeyExpression}), ${topAlias})`;
};

const eventFilterOptionScopeCondition = (
  scope: EventFilterOptionScope,
): string => {
  switch (scope) {
    case "scoredTraces":
      return "e.trace_id IN (SELECT DISTINCT trace_id FROM scores WHERE project_id = {projectId: String})";
  }
};

export const buildEventsFilterOptionColumnQuery = (params: {
  projectId: string;
  filter: FilterState;
  column: EventFilterOptionColumn;
  limit: number;
  offset?: number;
  scope?: EventFilterOptionScope;
}): { query: string; params: Record<string, unknown> } | null => {
  if (params.limit <= 0) {
    return null;
  }

  const column = normalizeEventFilterOptionColumn(params.column);
  const definition = EVENTS_FILTER_OPTION_DEFINITIONS[column];
  const eventsFilter = new FilterList(
    createFilterFromFilterState(
      params.filter,
      eventsTableUiColumnDefinitions,
      eventsTableCols,
    ),
  );

  const valueExpression =
    definition.kind === "scalar"
      ? `toString(${definition.expression})`
      : definition.kind === "boolean"
        ? `if(${definition.expression}, 'true', 'false')`
        : `arrayJoin(${optionValuesArrayExpression(column)})`;

  const queryBuilder = new EventsAggQueryBuilder({
    projectId: params.projectId,
    groupByColumn: "value",
    selectExpression: `${eventFilterOptionColumnSqlLiteral(column)} AS column, ${valueExpression} AS value, count() AS count`,
  })
    .where(eventsFilter.apply())
    .whereRaw(optionPresenceCondition(column))
    .orderBy(singleColumnOrderBy(column))
    .limit(params.limit, params.offset ?? 0);

  if (params.scope) {
    queryBuilder.whereRaw(eventFilterOptionScopeCondition(params.scope));
  }

  return queryBuilder.buildWithParams();
};

export const buildEventsFilterOptionsForColumnsQuery = (params: {
  projectId: string;
  filter: FilterState;
  columns: readonly EventFilterOptionColumn[];
  limit: number;
  scope?: EventFilterOptionScope;
  /**
   * When provided, the query also returns the approximate total observation
   * count matching this filter (the row query's active filters + time range),
   * as a single `uniqIf(span_id, …)` riding the SAME facet scan — no extra
   * ClickHouse scan. Surfaced as a sentinel row (see
   * `EVENTS_APPROX_TOTAL_COUNT_MARKER`); its `value` is `"partial"` when
   * non-native filters were dropped (see below), else `""`.
   *
   * Only native `e.*`-column filters are inlined into the `uniqIf` predicate.
   * Score and comment filters need joins/Postgres, and input/output filters
   * need `events_full`, so they are dropped from the predicate — the count
   * then over-counts vs the row query (flagged `"partial"` so the UI can label
   * it and drop the "within a few percent" claim).
   *
   * Correctness of the `uniqIf` count depends on the facet scan's WHERE being a
   * superset of the count predicate. TODAY that holds trivially: the caller
   * passes no column `filter`, so the scan's WHERE is project + time range only
   * (see the caller in eventsService — the FE sends `startTimeFilter`, not
   * `filter`). Every native count predicate is therefore a narrowing of that
   * scan, so `uniqIf` equals `uniq` over the native filter.
   *
   * WARNING: if a future change (e.g. the in-flight facet self-refinement,
   * LFE-14489 / #15466) makes this scan apply active COLUMN filters to its
   * WHERE, the superset invariant must be re-verified. It still holds if the
   * scan only ever self-excludes (drops) predicates; but if it adds a predicate
   * the count does not, `uniqIf` can UNDERCOUNT — re-check before relying on it.
   */
  countFilter?: FilterState;
}): { query: string; params: Record<string, unknown> } | null => {
  const columns = uniqueEventFilterOptionColumns(params.columns);
  if (columns.length === 0 || params.limit <= 0) {
    return null;
  }

  const optionLimit = Math.min(params.limit, EVENTS_FILTER_OPTION_TOP_K_MAX_N);
  const { queryBuilder: aggregatedOptionsBuilder } =
    buildEventsObservationRowSelection({
      projectId: params.projectId,
      filter: params.filter,
    });

  const includeApproxTotal = params.countFilter !== undefined;
  // Split the count filter: only native `e.*` columns can be inlined into the
  // predicate. Score/comment filters (their own groups) plus input/output
  // (events_core stores those truncated — they need events_full) are dropped;
  // when anything is dropped, the count over-counts and is flagged "partial".
  const countGroups = groupEventsObservationFilters(params.countFilter ?? []);
  const inlineableCountFilters = countGroups.events.filter(
    (f) => !NON_INLINEABLE_EVENT_FILTER_COLUMNS.has(f.column),
  );
  const droppedNonNativeCount =
    countGroups.comments.length +
    countGroups.observationScores.length +
    countGroups.traceScores.length +
    (countGroups.events.length - inlineableCountFilters.length);
  const countScopeIsPartial = includeApproxTotal && droppedNonNativeCount > 0;
  const countPredicate = includeApproxTotal
    ? new FilterList(
        createFilterFromFilterState(
          inlineableCountFilters,
          eventsTableUiColumnDefinitions,
          eventsTableCols,
        ),
      ).apply()
    : { query: "", params: {} as Record<string, unknown> };
  const approxTotalCountSelect = countPredicate.query
    ? `uniqIf(e.span_id, (${countPredicate.query})) AS approx_total_count`
    : `uniq(e.span_id) AS approx_total_count`;

  aggregatedOptionsBuilder.selectRaw(
    ...columns.map(optionTopKSelectExpression),
    ...(includeApproxTotal ? [approxTotalCountSelect] : []),
  );

  if (params.scope) {
    aggregatedOptionsBuilder.whereRaw(
      eventFilterOptionScopeCondition(params.scope),
    );
  }

  const { query: aggregatedOptionsQuery, params: aggregatedOptionsParams } =
    aggregatedOptionsBuilder.buildWithParams();

  // The approximate total is emitted as one extra sentinel row, so the result
  // shape stays `{column, value, count}` and callers pick it out by column.
  // `value` carries the partial-scope flag ("partial" when non-native filters
  // were dropped from the predicate, else "").
  const approxTotalCountRow = includeApproxTotal
    ? `,\n      [tuple('${EVENTS_APPROX_TOTAL_COUNT_MARKER}', '${countScopeIsPartial ? "partial" : ""}', toUInt64(approx_total_count), toInt64(0))]`
    : "";

  const query = `
WITH aggregated_options AS (
${aggregatedOptionsQuery}
),
option_rows AS (
  SELECT
    arrayJoin(arrayConcat(
      ${columns.map(optionRowsArrayExpression).join(",\n      ")}${approxTotalCountRow}
    )) AS option
  FROM aggregated_options
)
SELECT
  tupleElement(option, 1) AS column,
  tupleElement(option, 2) AS value,
  tupleElement(option, 3) AS count
FROM option_rows
ORDER BY column ASC, tupleElement(option, 4) ASC, tupleElement(option, 2) ASC
`.trim();

  return {
    query,
    params: {
      ...aggregatedOptionsParams,
      ...(includeApproxTotal ? countPredicate.params : {}),
      optionLimit,
    },
  };
};
