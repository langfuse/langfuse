import { eventsTableCols } from "../../../eventsTable";
import { InvalidRequestError } from "../../../errors";
import type { TracingSearchType } from "../../../interfaces/search";
import { findUiColumnMapping } from "../../../tableDefinitions";
import type { FilterCondition } from "../../../types";
import { eventsTableUiColumnDefinitions } from "../../tableMappings/mapEventsTable";
import { FilterList, filtersRequireEventsFull } from "./clickhouse-filter";
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
    ],
  });

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

  const eventsFilter = new FilterList(
    createFilterFromFilterState(
      filter ?? [],
      eventsTableUiColumnDefinitions,
      eventsTableCols,
    ),
  );
  const startTimeFrom = extractTimeFilter(eventsFilter);
  const hasObservationScoreFilter = filterGroups.observationScores.length > 0;
  const hasTraceScoreFilter = filterGroups.traceScores.length > 0;
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
        eventsTracesScoresAggregationFromObservationStart({
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
