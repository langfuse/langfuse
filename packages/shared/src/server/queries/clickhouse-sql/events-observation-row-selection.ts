import { eventsTableCols } from "../../../eventsTable";
import { InvalidRequestError } from "../../../errors";
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
};

type ObservationScoreDependency = {
  cte: ReturnType<typeof eventsScoresAggregation>;
  joinTable: string;
  joinCondition: string;
  selectExpressions?: string[];
  /**
   * Blob export: also join the trace-score CTE (with tuple encoding) so the
   * `ts.*` select expressions resolve and trace-level scores land in the
   * export like they do in the UI's unified Scores column (LFE-10596).
   */
  includeTraceScores?: boolean;
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
  ({ projectId, startTimeFrom }) => ({
    cte: eventsScoresAggregation({
      projectId,
      startTimeFrom,
      includeTupleEncoding: true,
    }),
    joinTable: "scores_agg s",
    joinCondition:
      "ON s.trace_id = e.trace_id AND s.observation_id = e.span_id",
    selectExpressions: [
      "s.scores_avg as scores_avg",
      "s.score_categories as score_categories",
      "s.score_categories_tuples as score_categories_tuples",
      "ts.scores_avg as trace_scores_avg",
      "ts.score_categories_tuples as trace_score_categories_tuples",
    ],
    includeTraceScores: true,
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
  }: EventsObservationRowSelectionInput,
  observationScoreDependencyFactory?: ObservationScoreDependencyFactory,
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
  const eventsFilter = new FilterList(
    createFilterFromFilterState(
      filter ?? [],
      eventsTableUiColumnDefinitions,
      eventsTableCols,
    ).map(toLevelAgnosticScoreFilter),
  );
  const startTimeFrom = extractTimeFilter(eventsFilter);
  const hasObservationScoreFilter = filterGroups.observationScores.length > 0;
  const queryBuilder = new EventsQueryBuilder({ projectId });
  const observationScoreDependency =
    observationScoreDependencyFactory?.({ projectId, startTimeFrom }) ??
    (hasObservationScoreFilter
      ? buildObservationScoreFilterDependency({ projectId, startTimeFrom })
      : undefined);
  // The trace-score CTE is needed for explicit trace-only filters, for the
  // level-agnostic union (an observation-scoped filter now references `ts.*`
  // too), and whenever the score dependency selects `ts.*` so trace-level
  // scores land in exports like they do in the UI's unified Scores column.
  const hasTraceScoreFilter =
    filterGroups.traceScores.length > 0 ||
    hasObservationScoreFilter ||
    Boolean(observationScoreDependency?.includeTraceScores);
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
        eventsTracesScoresAggregationFromObservationStart({
          projectId,
          startTimeFrom,
          hasScoreAggregationFilters: true,
          includeTupleEncoding: Boolean(
            observationScoreDependency?.includeTraceScores,
          ),
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

  return { queryBuilder, filterGroups, search, startTimeFrom };
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
