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
import { eventsTableUiColumnDefinitions } from "../../tableMappings/mapEventsTable";
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
  "ts.scores_avg as trace_scores_avg",
  "ts.score_categories_tuples as trace_score_categories_tuples",
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
  "s.scores_avg": "ts.scores_avg",
  "s.score_categories": "ts.score_categories",
  "s.score_booleans": "ts.score_booleans",
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

  if (columnDefinition?.clickhouseSelect.startsWith("ts.")) {
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

const SCORE_GROUPS: ReadonlySet<EventFilterGroup> = new Set([
  "observationScores",
  "traceScores",
]);

/**
 * The row conditions of the events (non-score) filters and the free-text
 * search, each compiled through the events predicate (`undefined` without
 * one), and what they imply for the host query.
 */
export type EventsRowConditions = {
  events?: CompiledEventsCondition;
  search?: CompiledEventsCondition;
  requiresEventsFull: boolean;
  /** The first `startTime >=` / `>` filter value, which bounds the score CTEs. */
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

/** The value of the first `startTime >=` / `>` condition, as ClickHouse text. */
const startTimeFromOf = (conditions: PredicateCondition[]): string | null => {
  const from = conditions.find(
    (condition) =>
      condition.type === "datetime" &&
      (condition.op === ">=" || condition.op === ">") &&
      resolvePredicateSourceField(eventsPredicateSource, condition.field.id)
        ?.id === "startTime",
  );
  return from?.type === "datetime"
    ? convertDateToClickhouseDateTime(new Date(from.value))
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
 * {@link EventsRowConditions} for the events filters (`positionInTrace`
 * leaves skipped: the caller selects by position) and the search. Both read
 * soft-deleted rows like the rest of the host query; the streams filter
 * `is_deleted` themselves. Throws `InvalidRequestError` for a numeric
 * metadata filter, which this path does not offer.
 */
const compileRowConditions = ({
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
  const leaves = filter.filter((leaf) => leaf.type !== "positionInTrace");
  rejectNumericMetadata(leaves);
  const { predicate, search } = fromFilterState({
    filter: leaves,
    searchQuery,
    searchType,
  });
  const conditions = predicateConditions(predicate);
  const options = { includeDeleted: true };
  const events =
    conditions.length > 0
      ? compileEventsPredicate(predicate, projectId, options)
      : undefined;
  const compiledSearch = search
    ? compileEventsSearch(search, projectId, options)
    : undefined;
  return {
    events,
    search: compiledSearch,
    requiresEventsFull: Boolean(
      events?.requiresEventsFull || compiledSearch?.requiresEventsFull,
    ),
    startTimeFrom: startTimeFromOf(conditions),
  };
};

/**
 * The score filters as a level-agnostic WHERE filter, the raw score rows
 * pushdown for the score CTEs, and which score level `orderBy` sorts by.
 */
const scoreRowConditions = ({
  filter,
  orderBy,
  includeScoreProjection,
}: {
  filter: FilterCondition[];
  orderBy?: OrderByState;
  includeScoreProjection: boolean;
}) => {
  const rawScoreFilters = createFilterFromFilterState(
    filter.filter((leaf) => SCORE_GROUPS.has(classifyFilter(leaf))),
    eventsTableUiColumnDefinitions,
    eventsTableCols,
  );
  const orderByColumn = findUiColumnMapping(
    eventsTableUiColumnDefinitions,
    orderBy?.column,
  );
  const scoreOrderField =
    orderByColumn?.clickhouseTableName === "scores"
      ? orderByColumn.clickhouseSelect
      : undefined;
  const ordersByTraceScore = scoreOrderField?.startsWith("ts.") ?? false;
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
        ordersByScoreData: scoreOrderField !== undefined,
      }),
    }),
    ordersByTraceScore,
    ordersByObservationScore:
      scoreOrderField !== undefined && !ordersByTraceScore,
  };
};

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

  const rowConditions = compileRowConditions({
    projectId,
    filter: filterGroups.events,
    searchQuery,
    searchType,
  });
  const includeScoreProjection = scoreProjection === "blob-export";
  const {
    scoreFilter,
    scoreRowsFilter,
    ordersByObservationScore,
    ordersByTraceScore,
  } = scoreRowConditions({
    filter: filter ?? [],
    orderBy,
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
        "trace_scores_agg AS ts",
        "ON ts.trace_id = e.trace_id AND ts.project_id = e.project_id",
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
