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

/** booleanStringOptionOperator maps a boolean operator to its string option operator */
const booleanStringOptionOperator = {
  "=": "any of",
  "<>": "none of",
} as const;

/** buildDataWindowPermalink links an alert to the data table scoped to its evaluation window, or undefined when NEXTAUTH_URL is unset */
export function buildDataWindowPermalink(
  params: DataWindowLinkParams,
): string | undefined {
  if (params.view === "observations") return linkToObservationsTable(params);
  return linkToScoresTable({ ...params, view: params.view });
}

/** linkToObservationsTable links to the observations table with every monitor filter */
function linkToObservationsTable(
  params: DataWindowLinkParams,
): string | undefined {
  const projectUrl = toProjectURL(params.projectId);
  if (!projectUrl) return undefined;
  return tableLink(
    `${projectUrl}/observations`,
    toDateRange(params.fromTimestamp, params.toTimestamp),
    toObservationsTableFilters(params.filters),
  );
}

/** linkToScoresTable links to the scores table with every monitor filter, restricted to the view's data types */
function linkToScoresTable(
  params: DataWindowLinkParams & { view: ScoresMonitorView },
): string | undefined {
  const projectUrl = toProjectURL(params.projectId);
  if (!projectUrl) return undefined;
  return tableLink(
    `${projectUrl}/scores`,
    toDateRange(params.fromTimestamp, params.toTimestamp),
    toScoresTableFilters(params.filters, params.view),
  );
}

/** toProjectURL returns the absolute project URL, or undefined when NEXTAUTH_URL is unset */
function toProjectURL(projectId: string): string | undefined {
  if (!env.NEXTAUTH_URL) return undefined;
  return `${env.NEXTAUTH_URL.replace(/\/$/, "")}/project/${projectId}`;
}

/** toDateRange encodes the evaluation window as the table's `<fromMs>-<toMs>` dateRange param */
function toDateRange(fromTimestamp: Date, toTimestamp: Date): string {
  return `${fromTimestamp.getTime()}-${toTimestamp.getTime()}`;
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

/** toScoresTableFilters converts monitor filters to scores table filters, restricted to the view's data types */
function toScoresTableFilters(
  filters: FilterState,
  view: ScoresMonitorView,
): FilterState {
  return [...filters.map(toScoresTableFilter), dataTypeFilter(view)];
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

/** toScoresTableFilter moves a booleanValue filter onto the table's Boolean Value facet */
function toScoresTableFilter(filter: FilterCondition): FilterCondition {
  if (filter.column === "booleanValue" && filter.type === "boolean") {
    return toBooleanStringOption(filter);
  }
  return filter;
}

/** toBooleanStringOption rewrites a boolean filter as the equivalent "true"/"false" string option */
function toBooleanStringOption(filter: BooleanFilter): FilterCondition {
  return {
    column: filter.column,
    type: "stringOptions",
    operator: booleanStringOptionOperator[filter.operator],
    value: [String(filter.value)],
  };
}

/** DataWindowLinkParams are the alert fields a data window link is built from */
type DataWindowLinkParams = Pick<
  MonitorAlert,
  "projectId" | "view" | "fromTimestamp" | "toTimestamp" | "filters"
>;

/** ScoresMonitorView is a monitor view backed by the scores table */
type ScoresMonitorView = Exclude<MonitorView, "observations">;

/** BooleanFilter is a filter on a boolean column */
type BooleanFilter = Extract<FilterCondition, { type: "boolean" }>;
