import type { FilterCondition } from "../../../types";
import { eventsTableCols } from "../../../eventsTable";
import type { TracingSearchType } from "../../../interfaces/search";
import { eventsTableUiColumnDefinitions } from "../../tableMappings/mapEventsTable";
import { FilterList } from "./clickhouse-filter";
import { EventsQueryBuilder } from "./event-query-builder";
import { createFilterFromFilterState } from "./factory";
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

export type EventsStreamQueryInput = {
  projectId: string;
  cutoffCreatedAt?: Date;
  filter: FilterCondition[] | null;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  rowLimit: number;
  configureQuery: (builder: EventsQueryBuilder) => EventsQueryBuilder;
};

export type EventsStreamQuery = {
  query: string;
  params: Record<string, any>;
  eventOnlyFilters: FilterCondition[];
};

/**
 * Builds the common event selection used by streaming consumers.
 *
 * Score and comment filters are intentionally excluded here to preserve the
 * legacy stream behavior. They are applied by the shared row-selection planner
 * in a later, behavior-changing step.
 */
export const buildEventsStreamQuery = ({
  projectId,
  cutoffCreatedAt,
  filter,
  searchQuery,
  searchType,
  rowLimit,
  configureQuery,
}: EventsStreamQueryInput): EventsStreamQuery => {
  const eventOnlyFilters = (filter ?? []).filter((filterItem) => {
    const columnDefinition = eventsTableUiColumnDefinitions.find(
      (column) =>
        column.uiTableName === filterItem.column ||
        column.uiTableId === filterItem.column,
    );

    return (
      columnDefinition?.clickhouseTableName !== "scores" &&
      columnDefinition?.clickhouseTableName !== "comments"
    );
  });

  const filterConditions: FilterCondition[] = [...eventOnlyFilters];
  if (cutoffCreatedAt) {
    filterConditions.push({
      column: "startTime",
      operator: "<",
      value: cutoffCreatedAt,
      type: "datetime",
    });
  }

  const eventsFilter = new FilterList(
    createFilterFromFilterState(
      filterConditions,
      eventsTableUiColumnDefinitions,
      eventsTableCols,
    ),
  );

  const search = eventSearchCondition({
    query: searchQuery,
    searchType,
  });

  const eventsQuery = configureQuery(new EventsQueryBuilder({ projectId }))
    .when(search.requiresEventsFull, (builder) => builder.forceFullTable())
    .where(eventsFilter.apply())
    .where(search)
    .whereRaw("e.is_deleted = 0")
    .orderByDefault()
    .limitBy("e.span_id", "e.project_id")
    .limit(rowLimit);

  return {
    ...eventsQuery.buildWithParams(),
    eventOnlyFilters,
  };
};
