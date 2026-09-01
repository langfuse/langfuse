import { TableViewPresetTableName } from "../domain/table-view-presets";
import { type FilterState } from "../types";
import { encodeFiltersGeneric } from "../features/filters/filterQueryEncoding";
import { rangeToString, type TABLE_AGGREGATION_OPTIONS } from "./dateRanges";

type ProductPathQuery = Record<string, string | string[] | null | undefined>;

export function parseSavedViewFromURL(
  currentUrl: string,
  isV4Enabled: boolean,
) {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(currentUrl, "https://langfuse.local");
  } catch {
    return undefined;
  }

  const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
  const projectSegmentIndex = pathSegments.indexOf("project");
  const section = pathSegments[projectSegmentIndex + 2];
  const detailId = pathSegments[projectSegmentIndex + 3];
  const viewId = parsedUrl.searchParams.get("viewId");

  if (projectSegmentIndex === -1 || !section || !viewId) {
    return undefined;
  }

  if (section === "traces" && !detailId) {
    return {
      viewId,
      tableName: isV4Enabled
        ? TableViewPresetTableName.ObservationsEvents
        : TableViewPresetTableName.Traces,
    };
  }

  if (section === "observations" && !detailId) {
    return {
      viewId,
      tableName: isV4Enabled
        ? TableViewPresetTableName.ObservationsEvents
        : TableViewPresetTableName.Observations,
    };
  }

  if (section === "sessions") {
    return {
      viewId,
      tableName: detailId
        ? TableViewPresetTableName.SessionDetail
        : TableViewPresetTableName.Sessions,
    };
  }

  if (section === "datasets" && !detailId) {
    return { viewId, tableName: TableViewPresetTableName.Datasets };
  }

  if (section === "scores" && !detailId) {
    return { viewId, tableName: TableViewPresetTableName.Scores };
  }

  if (section === "experiments" && detailId === "results") {
    return { viewId, tableName: TableViewPresetTableName.ExperimentItems };
  }

  if (section === "experiments" && !detailId) {
    return { viewId, tableName: TableViewPresetTableName.Experiments };
  }

  return undefined;
}

/**
 * Tables whose permalink includes a resource id already present in the
 * current path (e.g. `/sessions/[sessionId]`). The server
 * `generatePermalink` helper only knows project + table, so these must be
 * built from `window.location` on the client.
 */
export const tableViewPresetPermalinkUsesCurrentPath = (
  tableName: TableViewPresetTableName,
): boolean => tableName === TableViewPresetTableName.SessionDetail;

/**
 * Permalink for a saved view that cannot be expressed as
 * `/project/:id/<table>?viewId=…` because the page also needs a resource
 * id (session detail). Drops existing query/hash so a non-active view
 * shares its stored state, not the page's in-progress filters.
 */
export function buildCurrentPageSavedViewPermalink(params: {
  origin: string;
  pathname: string;
  viewId: string;
}): string {
  const url = new URL(params.pathname, params.origin);
  url.search = "";
  url.hash = "";
  url.searchParams.set("viewId", params.viewId);
  return url.toString();
}

type TracesPathTimeRange =
  | { preset: (typeof TABLE_AGGREGATION_OPTIONS)[number] }
  | { from: string; to: string };

type TracesPathFilters = {
  bookmarked?: boolean;
  environment?: string[];
  level?: string[];
  metadata?: Array<{ key: string; value: string }>;
  sessionId?: string[];
  tags?: string[];
  traceId?: string;
  traceName?: string[];
  userId?: string[];
  version?: string;
};

type TracesPathOrderBy = {
  column: "timestamp" | "startTime" | "traceName" | "latency";
  order: "ASC" | "DESC";
};

type TracesPathParams = {
  filters?: TracesPathFilters;
  orderBy?: TracesPathOrderBy;
  search?: {
    query: string;
    type?: string[];
  };
  timeRange?: TracesPathTimeRange;
};

export const appendProductPathQuery = (
  path: string,
  query: ProductPathQuery,
): string => {
  const searchParams = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (!value) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item) {
          searchParams.append(key, item);
        }
      });
    } else {
      searchParams.set(key, value);
    }
  });

  const queryString = searchParams.toString();

  return queryString ? `${path}?${queryString}` : path;
};

export const buildProjectPath = (params: { projectId: string }) =>
  `/project/${encodeURIComponent(params.projectId)}`;

export const buildDashboardsPath = (params: { projectId: string }) =>
  `${buildProjectPath(params)}/dashboards`;

export const buildDashboardWidgetsPath = (params: { projectId: string }) =>
  `${buildProjectPath(params)}/widgets`;

export const buildDashboardWidgetPath = (params: {
  projectId: string;
  widgetId: string;
}) =>
  `${buildDashboardWidgetsPath(params)}/${encodeURIComponent(params.widgetId)}`;

export const buildDatasetsPath = (params: {
  projectId: string;
  folder?: string;
}) =>
  appendProductPathQuery(`${buildProjectPath(params)}/datasets`, {
    folder: params.folder,
  });

export const buildEvalsPath = (params: { projectId: string }) =>
  `${buildProjectPath(params)}/evals`;

export const buildExperimentsPath = (params: { projectId: string }) =>
  `${buildProjectPath(params)}/experiments`;

export const buildExperimentPath = (params: {
  projectId: string;
  experimentId: string;
}) =>
  appendProductPathQuery(`${buildExperimentsPath(params)}/results`, {
    baseline: params.experimentId,
  });

export const buildModelsPath = (params: { projectId: string }) =>
  `${buildProjectPath(params)}/models`;

export const buildMonitorsPath = (params: { projectId: string }) =>
  `${buildProjectPath(params)}/alerts`;

export const buildPlaygroundPath = (params: { projectId: string }) =>
  `${buildProjectPath(params)}/playground`;

export const buildProjectMembersPath = (params: { projectId: string }) =>
  `${buildProjectPath(params)}/settings/members`;

export const buildProjectSettingsPath = (params: {
  projectId: string;
  page?: string;
}) =>
  params.page && params.page !== "index"
    ? `${buildProjectPath(params)}/settings/${params.page}`
    : `${buildProjectPath(params)}/settings`;

export const buildPromptsPath = (params: {
  projectId: string;
  folder?: string;
}) =>
  appendProductPathQuery(`${buildProjectPath(params)}/prompts`, {
    folder: params.folder,
  });

export const buildScoresPath = (params: { projectId: string }) =>
  `${buildProjectPath(params)}/scores`;

export const buildTracePath = (params: {
  projectId: string;
  traceId: string;
  observationId?: string | null;
  timestamp?: Date | string | null;
}) =>
  appendProductPathQuery(
    `${buildProjectPath(params)}/traces/${encodeURIComponent(params.traceId)}`,
    {
      observation: params.observationId,
      timestamp:
        params.timestamp instanceof Date
          ? params.timestamp.toISOString()
          : decodeURIComponentSafely(params.timestamp),
    },
  );

const decodeURIComponentSafely = (value?: string | null) => {
  if (!value) {
    return undefined;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const buildTracesPath = (params: {
  projectId: string;
  isV4Enabled?: boolean;
  params?: TracesPathParams;
  query?: ProductPathQuery;
}) =>
  appendProductPathQuery(
    `${buildProjectPath(params)}/traces`,
    params.params
      ? {
          ...getTracesPathQuery(params.params, Boolean(params.isV4Enabled)),
          ...params.query,
        }
      : (params.query ?? {}),
  );

function getTracesPathQuery(
  params: TracesPathParams,
  isV4Enabled: boolean,
): ProductPathQuery {
  const filters = params.filters
    ? getTracesFilterState(params.filters, isV4Enabled)
    : [];
  const orderBy = params.orderBy
    ? normalizeTracesOrderBy(params.orderBy, isV4Enabled)
    : undefined;

  return {
    dateRange: params.timeRange
      ? getDateRangeQueryValue(params.timeRange)
      : undefined,
    filter: filters.length > 0 ? encodeFiltersGeneric(filters) : undefined,
    orderBy: orderBy
      ? `column-${orderBy.column}_order-${orderBy.order}`
      : undefined,
    search: params.search?.query,
    searchType: params.search?.type,
  };
}

function getDateRangeQueryValue(timeRange: TracesPathTimeRange) {
  if ("preset" in timeRange) {
    return rangeToString({ range: timeRange.preset });
  }

  return rangeToString({
    from: new Date(timeRange.from),
    to: new Date(timeRange.to),
  });
}

function getTracesFilterState(
  filters: TracesPathFilters,
  isV4Enabled: boolean,
): FilterState {
  const filterState: FilterState = [];

  const addStringOptionsFilter = (
    column: string,
    value: string[] | undefined,
  ) => {
    if (!value || value.length === 0) {
      return;
    }

    filterState.push({
      column,
      operator: "any of",
      type: "stringOptions",
      value,
    });
  };

  const addArrayOptionsFilter = (
    column: string,
    value: string[] | undefined,
  ) => {
    if (!value || value.length === 0) {
      return;
    }

    filterState.push({
      column,
      operator: "any of",
      type: "arrayOptions",
      value,
    });
  };

  addStringOptionsFilter("environment", filters.environment);
  addStringOptionsFilter("level", filters.level);
  if (!isV4Enabled) {
    addStringOptionsFilter("sessionId", filters.sessionId);
  }
  addStringOptionsFilter("traceName", filters.traceName);
  addStringOptionsFilter("userId", filters.userId);
  addArrayOptionsFilter(isV4Enabled ? "tags" : "traceTags", filters.tags);

  if (!isV4Enabled && filters.bookmarked !== undefined) {
    filterState.push({
      column: "bookmarked",
      operator: "=",
      type: "boolean",
      value: filters.bookmarked,
    });
  }

  if (filters.traceId) {
    filterState.push({
      column: isV4Enabled ? "traceId" : "id",
      operator: "=",
      type: "string",
      value: filters.traceId,
    });
  }

  if (filters.version) {
    if (isV4Enabled) {
      filterState.push({
        column: "version",
        operator: "any of",
        type: "stringOptions",
        value: [filters.version],
      });
    } else {
      filterState.push({
        column: "version",
        operator: "=",
        type: "string",
        value: filters.version,
      });
    }
  }

  for (const metadataFilter of filters.metadata ?? []) {
    filterState.push({
      column: "metadata",
      key: metadataFilter.key,
      operator: "=",
      type: "stringObject",
      value: metadataFilter.value,
    });
  }

  return filterState;
}

function normalizeTracesOrderBy(
  orderBy: TracesPathOrderBy,
  isV4Enabled: boolean,
) {
  if (orderBy.column === "timestamp" || orderBy.column === "startTime") {
    return {
      column: isV4Enabled ? "startTime" : "timestamp",
      order: orderBy.order,
    };
  }

  return orderBy;
}

export const buildSessionPath = (params: {
  projectId: string;
  sessionId: string;
}) =>
  `${buildProjectPath(params)}/sessions/${encodeURIComponent(params.sessionId)}`;

export const buildSessionsPath = (params: { projectId: string }) =>
  `${buildProjectPath(params)}/sessions`;
