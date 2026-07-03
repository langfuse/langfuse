import type { FilterState } from "@langfuse/shared";
import { encodeFiltersGeneric } from "@/src/features/filters/lib/filter-query-encoding";
import { getProductBaseUrl } from "@/src/utils/base-url";
import {
  rangeToString,
  type TABLE_AGGREGATION_OPTIONS,
} from "@/src/utils/date-range-utils";

type ProductPathQuery = Record<string, string | string[] | null | undefined>;

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

const buildProductUrl = (path: string, query?: ProductPathQuery) => {
  const baseUrl = getProductBaseUrl();
  const basePath = baseUrl.pathname.replace(/\/$/, "");
  const url = new URL(`${basePath}${path}`, baseUrl);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (!value) {
      continue;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item) {
          url.searchParams.append(key, item);
        }
      });
    } else {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
};

export const buildProjectPath = (params: { projectId: string }) =>
  `/project/${encodeURIComponent(params.projectId)}`;

export const buildDashboardsPath = (params: { projectId: string }) =>
  `${buildProjectPath(params)}/dashboards`;

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

export const buildModelsPath = (params: { projectId: string }) =>
  `${buildProjectPath(params)}/models`;

export const buildMonitorsPath = (params: { projectId: string }) =>
  `${buildProjectPath(params)}/monitors`;

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
  timestamp?: string;
}) =>
  appendProductPathQuery(
    `${buildProjectPath(params)}/traces/${encodeURIComponent(params.traceId)}`,
    { timestamp: params.timestamp },
  );

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

export const buildTraceUrl = (params: { projectId: string; traceId: string }) =>
  buildProductUrl(buildTracePath(params));

export const buildObservationUrl = (params: {
  projectId: string;
  traceId: string;
  observationId: string;
}) =>
  buildProductUrl(buildTracePath(params), {
    observation: params.observationId,
  });

export const buildSessionUrl = (params: {
  projectId: string;
  sessionId: string;
}) => buildProductUrl(buildSessionPath(params));

export const buildCommentObjectUrl = (params: {
  projectId: string;
  objectType: string;
  objectId: string;
}) => {
  if (params.objectType === "TRACE") {
    return buildTraceUrl({
      projectId: params.projectId,
      traceId: params.objectId,
    });
  }

  if (params.objectType === "SESSION") {
    return buildSessionUrl({
      projectId: params.projectId,
      sessionId: params.objectId,
    });
  }

  return undefined;
};

export const buildScoreTargetUrl = (params: {
  projectId: string;
  traceId?: string | null;
  observationId?: string | null;
  sessionId?: string | null;
}) => {
  if (params.traceId && params.observationId) {
    return buildObservationUrl({
      projectId: params.projectId,
      traceId: params.traceId,
      observationId: params.observationId,
    });
  }

  if (params.traceId) {
    return buildTraceUrl({
      projectId: params.projectId,
      traceId: params.traceId,
    });
  }

  if (params.sessionId) {
    return buildSessionUrl({
      projectId: params.projectId,
      sessionId: params.sessionId,
    });
  }

  return undefined;
};

export const buildPromptUrl = (params: {
  projectId: string;
  name: string;
  version?: number;
}) =>
  buildProductUrl(
    `/project/${encodeURIComponent(params.projectId)}/prompts/${encodeURIComponent(params.name)}`,
    params.version === undefined
      ? undefined
      : { version: String(params.version) },
  );

export const buildDatasetUrl = (params: {
  projectId: string;
  datasetId: string;
}) =>
  buildProductUrl(
    `/project/${encodeURIComponent(params.projectId)}/datasets/${encodeURIComponent(params.datasetId)}/items`,
  );

export const buildDatasetItemUrl = (params: {
  projectId: string;
  datasetId: string;
  datasetItemId: string;
}) =>
  buildProductUrl(
    `/project/${encodeURIComponent(params.projectId)}/datasets/${encodeURIComponent(params.datasetId)}/items/${encodeURIComponent(params.datasetItemId)}`,
  );

export const buildDatasetRunUrl = (params: {
  projectId: string;
  datasetId: string;
  datasetRunId: string;
}) =>
  buildProductUrl(
    `/project/${encodeURIComponent(params.projectId)}/datasets/${encodeURIComponent(params.datasetId)}/runs/${encodeURIComponent(params.datasetRunId)}`,
  );

export const buildAnnotationQueueUrl = (params: {
  projectId: string;
  queueId: string;
}) =>
  buildProductUrl(
    `/project/${encodeURIComponent(params.projectId)}/annotation-queues/${encodeURIComponent(params.queueId)}`,
  );

export const buildAnnotationQueueItemUrl = (params: {
  projectId: string;
  queueId: string;
  itemId: string;
}) =>
  buildProductUrl(
    `/project/${encodeURIComponent(params.projectId)}/annotation-queues/${encodeURIComponent(params.queueId)}/items/${encodeURIComponent(params.itemId)}`,
    { singleItem: "true" },
  );

export const buildModelUrl = (params: { projectId: string; modelId: string }) =>
  buildProductUrl(
    `/project/${encodeURIComponent(params.projectId)}/settings/models/${encodeURIComponent(params.modelId)}`,
  );

export const buildEvaluatorUrl = (params: {
  projectId: string;
  evaluatorId: string;
}) =>
  buildProductUrl(
    `/project/${encodeURIComponent(params.projectId)}/evals/templates/${encodeURIComponent(params.evaluatorId)}`,
  );
