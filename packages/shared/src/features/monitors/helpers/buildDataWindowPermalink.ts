import { type ScoreDataTypeType } from "../../../domain/scores";
import { env } from "../../../env";
import { logger } from "../../../server/logger";
import type { FilterCondition, FilterState } from "../../../types";
import { encodeFiltersGeneric } from "../../filters/filterQueryEncoding";
import type { MonitorAlert, MonitorView } from "../types";

/** observationsTableColumnByViewField maps monitor view fields to differing observations table column ids */
const observationsTableColumnByViewField: Partial<Record<string, string>> = {
  tags: "traceTags",
  traceVersion: "version",
  traceRelease: "release",
  observationName: "name",
};

/** scoresDataTypesByView lists the score data types each scores view counts */
const scoresDataTypesByView: Record<ScoresMonitorView, ScoreDataTypeType[]> = {
  "scores-numeric": ["NUMERIC", "BOOLEAN"],
  "scores-boolean": ["BOOLEAN"],
  "scores-categorical": ["CATEGORICAL"],
};

/** buildDataWindowPermalink links an alert to the data table scoped to its evaluation window, or undefined when NEXTAUTH_URL is unset */
export function buildDataWindowPermalink(
  alert: Pick<
    MonitorAlert,
    "projectId" | "view" | "fromTimestamp" | "toTimestamp" | "filters"
  >,
): string | undefined {
  if (!env.NEXTAUTH_URL) return undefined;
  const params = {
    projectUrl: `${env.NEXTAUTH_URL.replace(/\/$/, "")}/project/${alert.projectId}`,
    dateRange: `${alert.fromTimestamp.getTime()}-${alert.toTimestamp.getTime()}`,
    filters: alert.filters,
  };
  if (alert.view === "observations") return linkToObservationsTable(params);
  return linkToScoresTable({ ...params, view: alert.view });
}

/** linkToObservationsTable links to the observations table with every monitor filter */
function linkToObservationsTable(params: TableLinkParams): string | undefined {
  return tableLink(
    `${params.projectUrl}/observations`,
    params.dateRange,
    toObservationsTableFilters(params.filters),
  );
}

/** linkToScoresTable links to the scores table with every monitor filter, restricted to the view's data types */
function linkToScoresTable(
  params: TableLinkParams & { view: ScoresMonitorView },
): string | undefined {
  return tableLink(`${params.projectUrl}/scores`, params.dateRange, [
    ...params.filters.map(toScoresTableFilter),
    dataTypeFilter(params.view),
  ]);
}

/** tableLink builds a table URL for the window, or undefined when a filter cannot be encoded; an empty filter clears stored and default table filters */
function tableLink(
  tableUrl: string,
  dateRange: string,
  filters: FilterState,
): string | undefined {
  let encodedFilters: string;
  try {
    encodedFilters = encodeFiltersGeneric(filters);
  } catch (error) {
    // A filter value encodeURIComponent rejects must not fail the monitor batch.
    logger.warn("Omitting monitor data link with unencodable filters", {
      tableUrl,
      error,
    });
    return undefined;
  }
  const query = new URLSearchParams({
    dateRange,
    filter: encodedFilters,
    // Alert filters own the environment scope, including an unrestricted one.
    showAllEnvironments: "true",
  });
  return `${tableUrl}?${query.toString()}`;
}

/** toObservationsTableFilters renames monitor view fields to observations table column ids */
function toObservationsTableFilters(filters: FilterState): FilterState {
  return filters.map((filter) => ({
    ...filter,
    column: observationsTableColumnByViewField[filter.column] ?? filter.column,
  }));
}

/** dataTypeFilter restricts the scores table to the data types the view counts */
function dataTypeFilter(view: ScoresMonitorView): FilterCondition {
  return {
    column: "dataType",
    type: "stringOptions",
    operator: "any of",
    value: scoresDataTypesByView[view],
  };
}

/** toScoresTableFilter rewrites boolean filters into the form the scores table applies */
function toScoresTableFilter(filter: FilterCondition): FilterCondition {
  if (filter.type !== "boolean") return filter;
  if (filter.column === "booleanValue") return toBooleanValueFilter(filter);
  return { ...filter, operator: "=", value: matchedBoolean(filter) };
}

/** toBooleanValueFilter selects a boolean score on the table's Boolean Value facet */
function toBooleanValueFilter(filter: BooleanFilter): FilterCondition {
  return {
    column: "booleanValue",
    type: "stringOptions",
    operator: "any of",
    value: [String(matchedBoolean(filter))],
  };
}

/** matchedBoolean returns the value a boolean filter selects */
function matchedBoolean(filter: BooleanFilter): boolean {
  if (filter.operator === "=") return filter.value;
  return !filter.value;
}

/** TableLinkParams are the inputs shared by every data table link */
type TableLinkParams = {
  projectUrl: string;
  dateRange: string;
  filters: FilterState;
};

/** ScoresMonitorView is a monitor view backed by the scores table */
type ScoresMonitorView = Exclude<MonitorView, "observations">;

/** BooleanFilter is a filter on a boolean column */
type BooleanFilter = Extract<FilterCondition, { type: "boolean" }>;
