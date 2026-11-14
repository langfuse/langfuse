import { eventsTableCols } from "../../../eventsTable";
import { InvalidRequestError } from "../../../errors/InvalidRequestError";
import type { OrderByState } from "../../../interfaces/orderBy";
import {
  hasValidTracingSearchTypes,
  TRACING_SEARCH_TYPE_REQUIRED_MESSAGE,
  type TracingSearchType,
} from "../../../interfaces/search";
import { fromFilterState } from "../../../query-ast/filterStateCodec";
import type {
  PredicateAnd,
  PredicateCondition,
} from "../../../query-ast/predicate";
import {
  eventsPredicateSource,
  resolvePredicateSourceField,
} from "../../../query-ast/sources";
import { findUiColumnMapping } from "../../../tableDefinitions/types";
import type { FilterCondition } from "../../../types";
import { convertDateToClickhouseDateTime } from "../../clickhouse/client";
import {
  compileEventsPredicate,
  compileEventsSearch,
  type CompiledEventsCondition,
} from "../../repositories/events-predicate";
import {
  eventsTableUiColumnDefinitions,
  TRACE_SCORES_JOIN_ALIAS,
} from "../../tableMappings/mapEventsTable";
import {
  BooleanObjectFilter,
  CategoryOptionsFilter,
  type Filter,
  FilterList,
  NumberObjectFilter,
} from "./clickhouse-filter";
import { EventsQueryBuilder } from "./event-query-builder";
import {
  createFilterFromFilterState,
  resolveLegacyScoreFilterColumn,
} from "./factory";
import {
  eventsScoresAggregation,
  eventsTracesScoresAggregationFromObservationStart,
} from "./query-fragments";
import {
  planScoreFilterPushdown,
  resolveScoreDataRequirement,
} from "./score-filter-pushdown";
import { clickhouseSearchCondition } from "./search";

const EVENT_SEARCH_COLUMNS = [
  "span_id",
  "name",
  "trace_name",
  "user_id",
  "session_id",
  "trace_id",
] as const;

export const eventSearchCondition = (opts: {
  query?: string;
  searchType?: TracingSearchType[];
}) =>
  clickhouseSearchCondition({
    query: opts.query,
    searchType: opts.searchType,
    tablePrefix: "e",
    searchColumns: EVENT_SEARCH_COLUMNS,
    useEventsTablePath: true,
  });

type EventFilterGroup =
  | "events"
  | "observationScores"
  | "traceScores"
  | "comments";

export type EventsObservationFilterGroups = Record<
  EventFilterGroup,
  FilterCondition[]
>;

export type EventsObservationRowSelectionInput = {
  projectId: string;
  filter: FilterCondition[] | null;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  /** Used to add the required score CTE and keep its source complete. */
  orderBy?: OrderByState;
};

type ScoreProjection = "none" | "blob-export";

const BLOB_EXPORT_SCORE_SELECTS = [
  "s.scores_avg as scores_avg",
  "s.score_categories as score_categories",
  "s.score_categories_tuples as score_categories_tuples",
  `${TRACE_SCORES_JOIN_ALIAS}.scores_avg as trace_scores_avg`,
  `${TRACE_SCORES_JOIN_ALIAS}.score_categories_tuples as trace_score_categories_tuples`,
];

// LFE-10596: in v4 the events table splits scores into observation-scoped
// columns (`s.scores_avg` / `s.score_categories` / `s.score_booleans`, joined
// on span_id) and trace-scoped columns (`ts.*`, joined on trace_id). A
// trace-level score only ever lands in the trace column, so a filter on the
// observation-scoped columns (the customer's saved filter, the sidebar
// "Scores" facets, and the search bar's `scores.` namespace) never matched
// trace-level scores. These helpers make those columns LEVEL-AGNOSTIC: the
// predicate matches if the score is found at observation OR trace level,
// restoring v3 "has it anywhere" semantics. `trace_scores_avg` /
// `trace_score_categories` / `trace_score_booleans` (the search bar's
// `traceScores.`) stay trace-only.
const OBSERVATION_SCORE_FIELDS = {
  "s.scores_avg": `${TRACE_SCORES_JOIN_ALIAS}.scores_avg`,
  "s.score_categories": `${TRACE_SCORES_JOIN_ALIAS}.score_categories`,
  "s.score_booleans": `${TRACE_SCORES_JOIN_ALIAS}.score_booleans`,
} as const;

/** A Filter whose predicate combines its children with a single junction. */
const unionFilter = (filters: Filter[], junction: "AND" | "OR"): Filter => ({
  clickhouseTable: filters[0].clickhouseTable,
  field: filters[0].field,
  operator: filters[0].operator,
  tablePrefix: filters[0].tablePrefix,
  apply() {
    const compiled = filters.map((f) => f.apply());
    return {
      query: `(${compiled.map((c) => `(${c.query})`).join(` ${junction} `)})`,
      params: Object.assign({}, ...compiled.map((c) => c.params)),
    };
  },
});

/**
 * Rewrites an observation-scoped score filter into a level-agnostic union
 * across the observation (`s.`) and trace (`ts.`) score columns. Filters on any
 * other column (including the trace-only `ts.*` columns) are returned as-is.
 *
 * Junction: numeric operators (`= > < >= <=`), categorical `any of`, and
 * boolean `=` are existence checks -> OR. Categorical `none of` and boolean
 * `<>` are exclusions, which over a union must be `NOT-obs AND NOT-trace`
 * (De Morgan), not `NOT(obs OR trace)`, so they use AND.
 */
export const toLevelAgnosticScoreFilter = (filter: Filter): Filter => {
  if (filter instanceof NumberObjectFilter && filter.field === "s.scores_avg") {
    const traceFilter = new NumberObjectFilter({
      clickhouseTable: filter.clickhouseTable,
      field: OBSERVATION_SCORE_FIELDS["s.scores_avg"],
      key: filter.key,
      operator: filter.operator,
      value: filter.value,
      tablePrefix: filter.tablePrefix,
    });
    return unionFilter([filter, traceFilter], "OR");
  }

  if (
    filter instanceof CategoryOptionsFilter &&
    filter.field === "s.score_categories"
  ) {
    const traceFilter = new CategoryOptionsFilter({
      clickhouseTable: filter.clickhouseTable,
      field: OBSERVATION_SCORE_FIELDS["s.score_categories"],
      key: filter.key,
      operator: filter.operator,
      values: filter.values,
      tablePrefix: filter.tablePrefix,
    });
    return unionFilter(
      [filter, traceFilter],
      filter.operator === "none of" ? "AND" : "OR",
    );
  }

  if (
    filter instanceof BooleanObjectFilter &&
    filter.field === "s.score_booleans"
  ) {
    const traceFilter = new BooleanObjectFilter({
      clickhouseTable: filter.clickhouseTable,
      field: OBSERVATION_SCORE_FIELDS["s.score_booleans"],
      key: filter.key,
      operator: filter.operator,
      value: filter.value,
      tablePrefix: filter.tablePrefix,
    });
    return unionFilter(
      [filter, traceFilter],
      filter.operator === "<>" ? "AND" : "OR",
    );
  }

  return filter;
};

const classifyFilter = (filter: FilterCondition): EventFilterGroup => {
  const filterColumn = resolveLegacyScoreFilterColumn(
    filter,
    eventsTableUiColumnDefinitions,
  );
  const columnDefinition = findUiColumnMapping(
    eventsTableUiColumnDefinitions,
    filterColumn,
  );

  if (columnDefinition?.clickhouseTableName === "comments") {
    return "comments";
  }

  if (
    columnDefinition?.clickhouseSelect.startsWith(`${TRACE_SCORES_JOIN_ALIAS}.`)
  ) {
    return "traceScores";
  }

  if (columnDefinition?.clickhouseSelect.startsWith("s.")) {
    return "observationScores";
  }

  return "events";
};

export const groupEventsObservationFilters = (
  filter: FilterCondition[] | null,
): EventsObservationFilterGroups => {
  const filterGroups: EventsObservationFilterGroups = {
    events: [],
    observationScores: [],
    traceScores: [],
    comments: [],
  };

  for (const filterItem of filter ?? []) {
    filterGroups[classifyFilter(filterItem)].push(filterItem);
  }

  return filterGroups;
};

/**
 * The row conditions of the events (non-score) filters and the free-text
 * search, each compiled through the events predicate (`undefined` without
 * one), and what they imply for the host query.
 */
export type EventsRowConditions = {
  events?: CompiledEventsCondition;
  search?: CompiledEventsCondition;
  requiresEventsFull: boolean;
  /**
   * The latest (tightest) top-level `startTime >=` / `>` filter value, which
   * bounds the score CTEs.
   */
  startTimeFrom: string | null;
};

/** The conditions of `predicate`, a conjunction `fromFilterState` built. */
const predicateConditions = (predicate: PredicateAnd): PredicateCondition[] =>
  predicate.children.filter(
    (child): child is PredicateCondition => child.kind === "condition",
  );

/**
 * Throws `InvalidRequestError` for a `numberObject` filter on metadata: the
 * metadata filter column is typed `stringObject`, and numeric metadata
 * conditions are not offered to users yet.
 */
const rejectNumericMetadata = (leaves: FilterCondition[]): void => {
  const numeric = leaves.find(
    (leaf) =>
      leaf.type === "numberObject" &&
      resolvePredicateSourceField(eventsPredicateSource, leaf.column)?.id ===
        "metadata",
  );
  if (numeric) {
    throw new InvalidRequestError(
      `Invalid filter type 'numberObject' for column '${numeric.column}'. Expected filter type 'stringObject'.`,
    );
  }
};

/**
 * The latest `startTime >=` / `>` bound among the top-level conditions, as
 * ClickHouse text. Every row matches all of them, so the latest one is the
 * tightest sound lower bound for the score CTEs.
 */
const startTimeFromOf = (conditions: PredicateCondition[]): string | null => {
  const bounds = conditions.flatMap((condition) =>
    condition.type === "datetime" &&
    (condition.op === ">=" || condition.op === ">") &&
    resolvePredicateSourceField(eventsPredicateSource, condition.field.id)
      ?.id === "startTime"
      ? [new Date(condition.value).getTime()]
      : [],
  );
  return bounds.length > 0
    ? convertDateToClickhouseDateTime(new Date(Math.max(...bounds)))
    : null;
};

/** `condition` as a WHERE clause of the raw-SQL builders; none without one. */
export const rowConditionClause = (
  condition: CompiledEventsCondition | undefined,
) => ({
  query: condition?.sql ?? "",
  params: condition?.params,
});

/**
 * `filter` without its `positionInTrace` leaves. They select events by their
 * place in the trace, not by a row condition, so callers of the row-selection
 * planner strip them first and handle them on their own, or drop them.
 */
export const withoutPositionInTrace = (
  filter: FilterCondition[] | null,
): FilterCondition[] =>
  (filter ?? []).filter((leaf) => leaf.type !== "positionInTrace");

/**
 * {@link EventsRowConditions} for the events filters and the search. Both read
 * soft-deleted rows like the rest of the host query; the streams filter
 * `is_deleted` themselves. Throws `InvalidRequestError` for a numeric
 * metadata filter, which this path does not offer, and `QueryCompileError`
 * for a `positionInTrace` leaf the caller did not strip
 * ({@link withoutPositionInTrace}).
 */
const compileEventsRowConditions = ({
  projectId,
  filter,
  searchQuery,
  searchType,
}: {
  projectId: string;
  filter: FilterCondition[];
  searchQuery?: string;
  searchType?: TracingSearchType[];
}): EventsRowConditions => {
  rejectNumericMetadata(filter);
  const { predicate, search } = fromFilterState({
    filter,
    searchQuery,
    searchType,
  });
  const events =
    predicate.children.length > 0
      ? compileEventsPredicate(predicate, projectId)
      : undefined;
  const compiledSearch = search
    ? compileEventsSearch(search, projectId)
    : undefined;
  return {
    events,
    search: compiledSearch,
    requiresEventsFull: Boolean(
      events?.requiresEventsFull || compiledSearch?.requiresEventsFull,
    ),
    startTimeFrom: startTimeFromOf(predicateConditions(predicate)),
  };
};

/**
 * The score level `orderBy` sorts by: `trace` for a column read from the
 * trace score aggregate (`ts.`), `observation` for any other score column
 * (`s.`), `undefined` when it does not sort by a score.
 */
const scoreOrderLevelOf = (
  orderBy: OrderByState | undefined,
): "observation" | "trace" | undefined => {
  const orderByColumn = findUiColumnMapping(
    eventsTableUiColumnDefinitions,
    orderBy?.column,
  );
  if (orderByColumn?.clickhouseTableName !== "scores") return undefined;
  return orderByColumn.clickhouseSelect.startsWith(
    `${TRACE_SCORES_JOIN_ALIAS}.`,
  )
    ? "trace"
    : "observation";
};

/**
 * The score filters of `filterGroups` (observation scores, then trace
 * scores) as a level-agnostic WHERE filter and the raw score rows pushdown
 * for the score CTEs.
 *
 * Legacy route: unlike {@link compileEventsRowConditions}, the score filters
 * still render as `FilterList` text, because the level-agnostic rewrite and
 * the score-CTE pushdown have no query-AST counterpart yet. This function
 * moves onto the AST once they do.
 */
const compileScoreRowConditions = ({
  filterGroups,
  ordersByScore,
  includeScoreProjection,
}: {
  filterGroups: EventsObservationFilterGroups;
  ordersByScore: boolean;
  includeScoreProjection: boolean;
}) => {
  const rawScoreFilters = createFilterFromFilterState(
    [...filterGroups.observationScores, ...filterGroups.traceScores],
    eventsTableUiColumnDefinitions,
    eventsTableCols,
  );
  return {
    // Observation-scoped score filters are rewritten into a level-agnostic
    // union across the obs (`s.`) and trace (`ts.`) score columns, for
    // every caller of this planner (events list, blob export, stream).
    scoreFilter: new FilterList(
      rawScoreFilters.map(toLevelAgnosticScoreFilter),
    ),
    scoreRowsFilter: planScoreFilterPushdown({
      filters: new FilterList(rawScoreFilters),
      scoreDataRequirement: resolveScoreDataRequirement({
        selectsScoreData: includeScoreProjection,
        ordersByScoreData: ordersByScore,
      }),
    }),
  };
};

/**
 * The events query that selects the observation rows matching `filter`, the
 * search and `orderBy`: it sorts the filters into groups, compiles the events
 * filters and the search through the events predicate, and adds the
 * observation and trace score CTEs and joins only when a score filter, a score
 * sort or the blob-export score projection needs them. Throws
 * `InvalidRequestError` for an unresolved comment filter, a search without a
 * search type, or a numeric metadata filter, and `QueryCompileError` for a
 * leftover `positionInTrace` filter.
 */
const buildEventsObservationRowSelectionInternal = (
  {
    projectId,
    filter,
    searchQuery,
    searchType,
    orderBy,
  }: EventsObservationRowSelectionInput,
  scoreProjection: ScoreProjection,
): {
  queryBuilder: EventsQueryBuilder;
  filterGroups: EventsObservationFilterGroups;
  rowConditions: EventsRowConditions;
} => {
  const filterGroups = groupEventsObservationFilters(filter);

  if (filterGroups.comments.length > 0) {
    throw new InvalidRequestError(
      "Event comment filters must be resolved before building the ClickHouse row selection.",
    );
  }
  if (!hasValidTracingSearchTypes({ searchQuery, searchType })) {
    throw new InvalidRequestError(TRACING_SEARCH_TYPE_REQUIRED_MESSAGE);
  }

  const rowConditions = compileEventsRowConditions({
    projectId,
    filter: filterGroups.events,
    searchQuery,
    searchType,
  });
  const includeScoreProjection = scoreProjection === "blob-export";
  const scoreOrderLevel = scoreOrderLevelOf(orderBy);
  const ordersByObservationScore = scoreOrderLevel === "observation";
  const ordersByTraceScore = scoreOrderLevel === "trace";
  const { scoreFilter, scoreRowsFilter } = compileScoreRowConditions({
    filterGroups,
    ordersByScore: scoreOrderLevel !== undefined,
    includeScoreProjection,
  });
  const startTimeFrom = rowConditions.startTimeFrom;
  const hasObservationScoreFilter = filterGroups.observationScores.length > 0;
  const needsObservationScores =
    hasObservationScoreFilter ||
    ordersByObservationScore ||
    includeScoreProjection;
  // Observation score filters are level-agnostic and therefore need both
  // observation and trace aggregates. Blob exports project both explicitly.
  const needsTraceScores =
    filterGroups.traceScores.length > 0 ||
    hasObservationScoreFilter ||
    ordersByTraceScore ||
    includeScoreProjection;
  const queryBuilder = new EventsQueryBuilder({ projectId });

  if (needsObservationScores) {
    queryBuilder
      .withCTE(
        "scores_agg",
        eventsScoresAggregation({
          projectId,
          startTimeFrom,
          includeTupleEncoding: includeScoreProjection,
          scoreRowsFilter,
        }),
      )
      .leftJoin(
        includeScoreProjection ? "scores_agg s" : "scores_agg AS s",
        includeScoreProjection
          ? "ON s.trace_id = e.trace_id AND s.observation_id = e.span_id"
          : "ON s.observation_id = e.span_id",
      );
  }

  if (needsTraceScores) {
    queryBuilder
      .withCTE(
        "trace_scores_agg",
        eventsTracesScoresAggregationFromObservationStart({
          projectId,
          startTimeFrom,
          hasScoreAggregationFilters: true,
          scoreRowsFilter,
          includeTupleEncoding: includeScoreProjection,
        }),
      )
      .leftJoin(
        `trace_scores_agg AS ${TRACE_SCORES_JOIN_ALIAS}`,
        `ON ${TRACE_SCORES_JOIN_ALIAS}.trace_id = e.trace_id AND ${TRACE_SCORES_JOIN_ALIAS}.project_id = e.project_id`,
      );
  }

  if (includeScoreProjection) {
    queryBuilder.selectRaw(...BLOB_EXPORT_SCORE_SELECTS);
  }

  queryBuilder
    .when(rowConditions.requiresEventsFull, (builder) =>
      builder.forceFullTable(),
    )
    .where(rowConditionClause(rowConditions.events))
    .where(scoreFilter.apply())
    .where(rowConditionClause(rowConditions.search));

  return { queryBuilder, filterGroups, rowConditions };
};

export const buildEventsObservationRowSelection = (
  input: EventsObservationRowSelectionInput,
) => buildEventsObservationRowSelectionInternal(input, "none");

export const buildEventsObservationRowSelectionForBlobExport = (
  input: EventsObservationRowSelectionInput,
) => buildEventsObservationRowSelectionInternal(input, "blob-export");
