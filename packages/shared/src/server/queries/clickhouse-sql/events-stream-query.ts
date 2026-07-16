import type { FilterCondition } from "../../../types";
import type { TracingSearchType } from "../../../interfaces/search";
import type { EventsQueryBuilder } from "./event-query-builder";
import {
  buildEventsObservationRowSelection,
  buildEventsObservationRowSelectionForBlobExport,
  groupEventsObservationFilters,
} from "./events-observation-row-selection";

export type EventsStreamQueryInput = {
  projectId: string;
  cutoffCreatedAt?: Date;
  filter: FilterCondition[] | null;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  rowLimit: number;
};

export type EventsStreamQuery = {
  queryBuilder: EventsQueryBuilder;
  eventOnlyFilters: FilterCondition[];
};

/**
 * Builds the common event selection used by streaming consumers.
 *
 * The returned builder is intentionally unprojected so each consumer can
 * select its own row shape. Callers must add a field set or raw selection
 * before building the query. Score and comment filters are intentionally
 * excluded here to preserve the legacy stream behavior.
 */
const buildEventsStreamQueryInternal = (
  {
    projectId,
    cutoffCreatedAt,
    filter,
    searchQuery,
    searchType,
    rowLimit,
  }: EventsStreamQueryInput,
  buildRowSelection: typeof buildEventsObservationRowSelection,
): EventsStreamQuery => {
  const originalFilterGroups = groupEventsObservationFilters(filter);
  const filterConditions: FilterCondition[] = [...originalFilterGroups.events];
  if (cutoffCreatedAt) {
    filterConditions.push({
      column: "startTime",
      operator: "<",
      value: cutoffCreatedAt,
      type: "datetime",
    });
  }

  const { queryBuilder } = buildRowSelection({
    projectId,
    filter: filterConditions,
    searchQuery,
    searchType,
    scoreFilterCapabilities: { observation: false, trace: false },
  });

  queryBuilder
    .whereRaw("e.is_deleted = 0")
    .orderByDefault()
    .limitBy("e.span_id", "e.project_id")
    .limit(rowLimit);

  return {
    queryBuilder,
    eventOnlyFilters: originalFilterGroups.events,
  };
};

export const buildEventsStreamQuery = (
  input: EventsStreamQueryInput,
): EventsStreamQuery =>
  buildEventsStreamQueryInternal(input, buildEventsObservationRowSelection);

/**
 * Builds the blob-export selection, including its observation-score projection
 * and the matching aggregation source.
 */
export const buildEventsBlobExportStreamQuery = (
  input: EventsStreamQueryInput,
): EventsStreamQuery => {
  const result = buildEventsStreamQueryInternal(
    input,
    buildEventsObservationRowSelectionForBlobExport,
  );

  result.queryBuilder
    .selectFieldSet("export")
    .selectIO(false) // Full I/O, no truncation
    .selectMetadataExpanded(); // Full metadata values from events_full

  return result;
};
