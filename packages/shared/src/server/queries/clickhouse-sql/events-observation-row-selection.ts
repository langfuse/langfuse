import { eventsTableCols } from "../../../eventsTable";
import { InvalidRequestError } from "../../../errors";
import type { OrderByState } from "../../../interfaces/orderBy";
import type { TracingSearchType } from "../../../interfaces/search";
import { findUiColumnMapping } from "../../../tableDefinitions";
import type { FilterCondition } from "../../../types";
import { eventsTableUiColumnDefinitions } from "../../tableMappings/mapEventsTable";
import {
  BooleanObjectFilter,
  CategoryOptionsFilter,
  type Filter,
  FilterList,
  filtersRequireEventsFull,
  NumberObjectFilter,
} from "./clickhouse-filter";
import { EventsQueryBuilder } from "./event-query-builder";
import {
  createFilterFromFilterState,
  resolveLegacyScoreFilterColumn,
} from "./factory";
import { extractTimeFilter } from "./filter-utils";
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
  search: ReturnType<typeof eventSearchCondition>;
  startTimeFrom: string | null;
} => {
  const filterGroups = groupEventsObservationFilters(filter);

  if (filterGroups.comments.length > 0) {
    throw new InvalidRequestError(
      "Event comment filters must be resolved before building the ClickHouse row selection.",
    );
  }

  // Observation-scoped score filters are rewritten into a level-agnostic
  // union across the obs (`s.`) and trace (`ts.`) score columns (LFE-10596),
  // for every caller of this planner (events list, blob export, stream).
  const rawEventsFilters = createFilterFromFilterState(
    filter ?? [],
    eventsTableUiColumnDefinitions,
    eventsTableCols,
  );
  const includeScoreProjection = scoreProjection === "blob-export";
  const orderByColumn = findUiColumnMapping(
    eventsTableUiColumnDefinitions,
    orderBy?.column,
  );
  const scoreOrderField =
    orderByColumn?.clickhouseTableName === "scores"
      ? orderByColumn.clickhouseSelect
      : undefined;
  const ordersByTraceScore = scoreOrderField?.startsWith("ts.") ?? false;
  const ordersByObservationScore =
    scoreOrderField !== undefined && !ordersByTraceScore;
  const scoreDataRequirement = resolveScoreDataRequirement({
    selectsScoreData: includeScoreProjection,
    ordersByScoreData: scoreOrderField !== undefined,
  });
  const scoreRowsFilter = planScoreFilterPushdown({
    filters: new FilterList(rawEventsFilters),
    scoreDataRequirement,
  });
  const eventsFilter = new FilterList(
    rawEventsFilters.map(toLevelAgnosticScoreFilter),
  );
  const startTimeFrom = extractTimeFilter(eventsFilter);
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

  const search = eventSearchCondition({ query: searchQuery, searchType });
  queryBuilder
    .when(
      search.requiresEventsFull || filtersRequireEventsFull(eventsFilter),
      (builder) => builder.forceFullTable(),
    )
    .applyFilters(eventsFilter)
    .where(search);

  return { queryBuilder, filterGroups, search, startTimeFrom };
};

export const buildEventsObservationRowSelection = (
  input: EventsObservationRowSelectionInput,
) => buildEventsObservationRowSelectionInternal(input, "none");

export const buildEventsObservationRowSelectionForBlobExport = (
  input: EventsObservationRowSelectionInput,
) => buildEventsObservationRowSelectionInternal(input, "blob-export");
