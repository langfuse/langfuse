import { eventsTableCols } from "../../../eventsTable";
import type { TracingSearchType } from "../../../interfaces/search";
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
import { createFilterFromFilterState } from "./factory";
import { extractTimeFilter } from "./filter-utils";
import {
  eventsScoresAggregation,
  eventsTracesScoresAggregation,
} from "./query-fragments";
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
  scoreFilterCapabilities: {
    observation: boolean;
    trace: boolean;
  };
};

type ObservationScoreDependency = {
  cte: ReturnType<typeof eventsScoresAggregation>;
  joinTable: string;
  joinCondition: string;
  selectExpressions?: string[];
};

type ObservationScoreDependencyFactory = (input: {
  projectId: string;
  startTimeFrom: string | null;
}) => ObservationScoreDependency;

const buildObservationScoreFilterDependency: ObservationScoreDependencyFactory =
  ({ projectId, startTimeFrom }) => ({
    cte: eventsScoresAggregation({ projectId, startTimeFrom }),
    joinTable: "scores_agg AS s",
    joinCondition: "ON s.observation_id = e.span_id",
  });

const buildBlobExportObservationScoreDependency: ObservationScoreDependencyFactory =
  ({ projectId }) => ({
    cte: eventsScoresAggregation({
      projectId,
      includeTupleEncoding: true,
    }),
    joinTable: "scores_agg s",
    joinCondition:
      "ON s.trace_id = e.trace_id AND s.observation_id = e.span_id",
    selectExpressions: [
      "s.scores_avg as scores_avg",
      "s.score_categories as score_categories",
      "s.score_categories_tuples as score_categories_tuples",
    ],
  });

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

/**
 * True when the FilterState carries an observation-scoped score filter
 * (`scores_avg` / `score_categories` / `score_booleans`, incl. legacy
 * aliases). These are rewritten into the level-agnostic union by
 * `toLevelAgnosticScoreFilter`, so both the obs (`s.`) and trace (`ts.`)
 * score CTEs must be joined (LFE-10596). Shared so the events list and the
 * batch export/action stream stay in sync.
 */
export const filterHasObservationScores = (
  filter: Array<{ column: string }>,
): boolean =>
  filter.some((f) => {
    const column = f.column.toLowerCase();
    return (
      column === "scores" ||
      column === "scores_avg" ||
      column === "score_categories" ||
      column === "score_booleans" ||
      column === "scores (numeric)" ||
      column === "scores (categorical)" ||
      column === "scores (boolean)"
    );
  });

/** True when the FilterState carries an explicit trace-only score filter. */
export const filterHasTraceScores = (
  filter: Array<{ column: string }>,
): boolean =>
  filter.some((f) => {
    const column = f.column.toLowerCase();
    return (
      column === "trace_scores_avg" ||
      column === "trace_score_categories" ||
      column === "trace_score_booleans" ||
      column === "trace scores (numeric)" ||
      column === "trace scores (categorical)" ||
      column === "trace scores (boolean)"
    );
  });

const classifyFilter = (filter: FilterCondition): EventFilterGroup => {
  const columnDefinition = eventsTableUiColumnDefinitions.find(
    (column) =>
      column.uiTableName === filter.column ||
      column.uiTableId === filter.column,
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
    scoreFilterCapabilities,
  }: EventsObservationRowSelectionInput,
  observationScoreDependencyFactory?: ObservationScoreDependencyFactory,
): {
  queryBuilder: EventsQueryBuilder;
  filterGroups: EventsObservationFilterGroups;
  search: ReturnType<typeof eventSearchCondition>;
} => {
  const filterGroups = groupEventsObservationFilters(filter);
  const classifiedFilters = (filter ?? []).map((filterItem) => ({
    filter: filterItem,
    group: classifyFilter(filterItem),
  }));

  const effectiveFilters = classifiedFilters.flatMap(({ filter, group }) => {
    if (group === "observationScores" && !scoreFilterCapabilities.observation) {
      return [];
    }
    if (group === "traceScores" && !scoreFilterCapabilities.trace) return [];
    return [filter];
  });

  // Observation-scoped score filters are rewritten into a level-agnostic
  // union across the obs (`s.`) and trace (`ts.`) score columns (LFE-10596).
  // The union references `ts.*`, so it only applies when the caller supports
  // the trace-score join.
  const levelAgnosticScores =
    scoreFilterCapabilities.observation && scoreFilterCapabilities.trace;
  const createdFilters = createFilterFromFilterState(
    effectiveFilters,
    eventsTableUiColumnDefinitions,
    eventsTableCols,
  );
  const eventsFilter = new FilterList(
    levelAgnosticScores
      ? createdFilters.map(toLevelAgnosticScoreFilter)
      : createdFilters,
  );
  const startTimeFrom = extractTimeFilter(eventsFilter);
  const hasObservationScoreFilter =
    scoreFilterCapabilities.observation &&
    eventsFilter.some(
      (filterItem) =>
        filterItem.clickhouseTable === "scores" &&
        filterItem.field.startsWith("s."),
    );
  const hasTraceScoreFilter =
    (scoreFilterCapabilities.trace &&
      eventsFilter.some(
        (filterItem) =>
          filterItem.clickhouseTable === "scores" &&
          filterItem.field.startsWith("ts."),
      )) ||
    // The level-agnostic union references the trace score CTE too, so join it
    // whenever an observation-scoped score filter is present, not only for
    // explicit `trace_scores_avg` filters.
    (levelAgnosticScores && hasObservationScoreFilter);
  const queryBuilder = new EventsQueryBuilder({ projectId });
  const observationScoreDependency =
    observationScoreDependencyFactory?.({ projectId, startTimeFrom }) ??
    (hasObservationScoreFilter
      ? buildObservationScoreFilterDependency({ projectId, startTimeFrom })
      : undefined);
  const search = eventSearchCondition({ query: searchQuery, searchType });

  if (observationScoreDependency) {
    queryBuilder
      .withCTE("scores_agg", observationScoreDependency.cte)
      .leftJoin(
        observationScoreDependency.joinTable,
        observationScoreDependency.joinCondition,
      );

    if (observationScoreDependency.selectExpressions) {
      queryBuilder.selectRaw(...observationScoreDependency.selectExpressions);
    }
  }

  queryBuilder
    .when(hasTraceScoreFilter, (builder) =>
      builder.withCTE(
        "trace_scores_agg",
        eventsTracesScoresAggregation({
          projectId,
          startTimeFrom,
          hasScoreAggregationFilters: true,
        }),
      ),
    )
    .when(hasTraceScoreFilter, (builder) =>
      builder.leftJoin(
        "trace_scores_agg AS ts",
        "ON ts.trace_id = e.trace_id AND ts.project_id = e.project_id",
      ),
    )
    .when(
      search.requiresEventsFull || filtersRequireEventsFull(eventsFilter),
      (builder) => builder.forceFullTable(),
    );

  queryBuilder.applyFilters(eventsFilter).where(search);

  return { queryBuilder, filterGroups, search };
};

export const buildEventsObservationRowSelection = (
  input: EventsObservationRowSelectionInput,
) => buildEventsObservationRowSelectionInternal(input);

export const buildEventsObservationRowSelectionForBlobExport = (
  input: EventsObservationRowSelectionInput,
) =>
  buildEventsObservationRowSelectionInternal(
    input,
    buildBlobExportObservationScoreDependency,
  );
