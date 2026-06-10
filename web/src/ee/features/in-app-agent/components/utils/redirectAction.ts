import type { FilterState } from "@langfuse/shared";
import { encodeFiltersGeneric } from "@/src/features/filters/lib/filter-query-encoding";
import { rangeToString } from "@/src/utils/date-range-utils";
import { assertUnreachable } from "@/src/utils/types";
import type { InAppAgentWindowMessage } from "../InAppAgentWindow";
import {
  InAppAgentRedirectToolInputSchema,
  type InAppAgentRedirectToolInput,
  type InAppAgentTracesRedirectFilters,
  type InAppAgentTracesRedirectInput,
  type InAppAgentTracesRedirectOrderBy,
  type InAppAgentTracesRedirectTimeRange,
} from "@/src/ee/features/in-app-agent/schema";

export type TracesRouteOptions = {
  isV4TracesEnabled: boolean;
  isV4TracesInitializing: boolean;
};

export function getRedirectActionMessage({
  messageId,
  toolCallId,
  args,
  projectId,
  tracesRouteOptions,
}: {
  messageId: string;
  toolCallId: string;
  args: string;
  projectId: string | undefined;
  tracesRouteOptions: TracesRouteOptions;
}): InAppAgentWindowMessage | null {
  if (!projectId) {
    return null;
  }

  try {
    const input = InAppAgentRedirectToolInputSchema.parse(JSON.parse(args));
    const href = getRedirectHref(input, projectId, tracesRouteOptions);

    if (!href) {
      return null;
    }

    return {
      id: `${messageId}-redirect-${toolCallId}`,
      role: "assistant",
      content: {
        type: "redirectAction",
        label: input.label,
        href,
      },
    };
  } catch {
    return null;
  }
}

function getRedirectHref(
  input: InAppAgentRedirectToolInput,
  projectId: string,
  tracesRouteOptions: TracesRouteOptions,
): string | null {
  const encodedProjectId = encodeURIComponent(projectId);
  const projectRoute = `/project/${encodedProjectId}`;

  if (input.destination === "dashboards") {
    return `${projectRoute}/dashboards`;
  }

  if (input.destination === "datasets") {
    return appendQuery(`${projectRoute}/datasets`, {
      folder: input.params?.folder,
    });
  }

  if (input.destination === "evals") {
    return `${projectRoute}/evals`;
  }

  if (input.destination === "experiments") {
    return `${projectRoute}/experiments`;
  }

  if (input.destination === "models") {
    return `${projectRoute}/models`;
  }

  if (input.destination === "monitors") {
    return `${projectRoute}/monitors`;
  }

  if (input.destination === "playground") {
    return `${projectRoute}/playground`;
  }

  if (input.destination === "projectMembers") {
    return `${projectRoute}/settings/members`;
  }

  if (input.destination === "projectSettings") {
    return input.params?.page && input.params.page !== "index"
      ? `${projectRoute}/settings/${input.params.page}`
      : `${projectRoute}/settings`;
  }

  if (input.destination === "prompts") {
    return appendQuery(`${projectRoute}/prompts`, {
      folder: input.params?.folder,
    });
  }

  if (input.destination === "scores") {
    return `${projectRoute}/scores`;
  }

  if (input.destination === "session") {
    return `${projectRoute}/sessions/${encodeURIComponent(input.params.sessionId)}`;
  }

  if (input.destination === "sessions") {
    return `${projectRoute}/sessions`;
  }

  if (input.destination === "trace") {
    return appendQuery(
      `${projectRoute}/traces/${encodeURIComponent(input.params.traceId)}`,
      { timestamp: input.params.timestamp },
    );
  }

  if (input.destination === "traces") {
    return getTracesRedirectHref(
      `${projectRoute}/traces`,
      input.params,
      tracesRouteOptions,
    );
  }

  return assertUnreachable(input);
}

function getTracesRedirectHref(
  basePath: string,
  params: InAppAgentTracesRedirectInput["params"],
  { isV4TracesEnabled, isV4TracesInitializing }: TracesRouteOptions,
): string | null {
  if (!params) {
    return basePath;
  }

  if (isV4TracesInitializing) {
    return null;
  }

  const filters = params.filters
    ? getTracesFilterState(params.filters, isV4TracesEnabled)
    : [];
  const orderBy = params.orderBy
    ? normalizeTracesOrderBy(params.orderBy, isV4TracesEnabled)
    : undefined;

  return appendQuery(basePath, {
    dateRange: params.timeRange
      ? getDateRangeQueryValue(params.timeRange)
      : undefined,
    filter: filters.length > 0 ? encodeFiltersGeneric(filters) : undefined,
    orderBy: orderBy
      ? `column-${orderBy.column}_order-${orderBy.order}`
      : undefined,
    search: params.search?.query,
    searchType: params.search?.type,
  });
}

function getDateRangeQueryValue(timeRange: InAppAgentTracesRedirectTimeRange) {
  if ("preset" in timeRange) {
    return rangeToString({ range: timeRange.preset });
  }

  return rangeToString({
    from: new Date(timeRange.from),
    to: new Date(timeRange.to),
  });
}

function getTracesFilterState(
  filters: InAppAgentTracesRedirectFilters,
  isV4TracesEnabled: boolean,
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

  addStringOptionsFilter("environment", filters.environment);
  addStringOptionsFilter("level", filters.level);
  addStringOptionsFilter("sessionId", filters.sessionId);
  addStringOptionsFilter("traceName", filters.traceName);
  addStringOptionsFilter("traceTags", filters.tags);
  addStringOptionsFilter("userId", filters.userId);

  if (filters.bookmarked !== undefined) {
    filterState.push({
      column: "bookmarked",
      operator: "=",
      type: "boolean",
      value: filters.bookmarked,
    });
  }

  if (filters.traceId) {
    filterState.push({
      column: isV4TracesEnabled ? "traceId" : "id",
      operator: "=",
      type: "string",
      value: filters.traceId,
    });
  }

  if (filters.release && !isV4TracesEnabled) {
    filterState.push({
      column: "release",
      operator: "=",
      type: "string",
      value: filters.release,
    });
  }

  if (filters.version) {
    if (isV4TracesEnabled) {
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
  orderBy: InAppAgentTracesRedirectOrderBy,
  isV4TracesEnabled: boolean,
) {
  if (orderBy.column === "timestamp" || orderBy.column === "startTime") {
    return {
      column: isV4TracesEnabled ? "startTime" : "timestamp",
      order: orderBy.order,
    };
  }

  return orderBy;
}

function appendQuery(
  path: string,
  query: Record<string, string | string[] | undefined>,
): string {
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
}

/* eslint-disable @repo/no-in-source-vitest */
const vitest = import.meta.vitest;

if (vitest && typeof vitest === "object") {
  const { describe, expect, it } = vitest;

  describe("appendQuery", () => {
    it("serializes array query values as repeated params", () => {
      const href = appendQuery("/project/project-1/traces", {
        search: "checkout",
        searchType: ["content", "input"],
      });

      expect(href).toBe(
        "/project/project-1/traces?search=checkout&searchType=content&searchType=input",
      );
    });
  });
}
