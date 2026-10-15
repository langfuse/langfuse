import { useState } from "react";
import isEqual from "lodash/isEqual";
import { StringParam, useQueryParams } from "use-query-params";
import { DEFAULT_SIDEBAR_IMPLICIT_ENVIRONMENT_CONFIG } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { useLiveTableDateRange } from "@/src/hooks/useLiveTableDateRange";
import { rangeToString } from "@/src/utils/date-range-utils";
import {
  useSidebarFilterState,
  buildSidebarFilterSessionContextId,
} from "@/src/features/filters";
import { agentsFilterConfig } from "../constants/agentsFilterConfig";
import { useAgentsPrototypeOptions } from "../prototype-options";
import { prepareAgents, type AgentSort } from "./prepareOverview";

const EMPTY_DATE = new Date(0);
export function useAgentsOverview(projectId: string) {
  const prototype = useAgentsPrototypeOptions(projectId);
  const { timeRange, setTimeRange } = useTableDateRange(projectId);
  const [refreshKey, setRefreshKey] = useState(0);
  const { range, anchoredTo } = useLiveTableDateRange(timeRange, refreshKey);
  const from = range?.from ?? EMPTY_DATE,
    to = range?.to ?? anchoredTo ?? EMPTY_DATE;
  const validWindow = Boolean(
    range &&
    anchoredTo &&
    from < to &&
    to.getTime() - from.getTime() <= 30 * 86_400_000,
  );
  const [query, setQuery] = useQueryParams({
    search: StringParam,
    agentStatus: StringParam,
    agentSort: StringParam,
    dateRange: StringParam,
  });
  const search = query.search?.trim() ?? "";
  const status =
    query.agentStatus === "active" || query.agentStatus === "dormant"
      ? query.agentStatus
      : "all";
  const sort: AgentSort =
    query.agentSort === "sessions" ||
    query.agentSort === "cost" ||
    query.agentSort === "name"
      ? query.agentSort
      : "attention";
  const environments = api.projects.environmentFilterOptions.useQuery(
    { projectId, fromTimestamp: range?.from },
    {
      enabled: Boolean(projectId) && validWindow,
      trpc: { context: { skipBatch: true } },
    },
  );
  const observedOptions = {
    environment: environments.data?.map((value) => value.environment),
  };
  const queryFilter = useSidebarFilterState(
    agentsFilterConfig,
    observedOptions,
    {
      stateLocation: "urlAndSessionStorage",
      sessionFilterContextId: buildSidebarFilterSessionContextId(projectId),
      implicitDefaultConfig: DEFAULT_SIDEBAR_IMPLICIT_ENVIRONMENT_CONFIG,
      loading: environments.isPending,
      isV4: true,
    },
  );
  const queryScope = {
    projectId,
    from,
    to,
    filter: queryFilter.effectiveFilterState,
  };
  const scope = { ...queryScope, prototypeOptions: prototype.options };
  const searchResult = api.agents.allFromEvents.useQuery(
    {
      ...queryScope,
      from: new Date(to.getTime() - 30 * 86_400_000),
      page: 0,
      limit: 25,
      searchQuery: search,
    },
    { enabled: Boolean(projectId) && validWindow && search.length > 0 },
  );
  const noSearchResults = Boolean(
    search && searchResult.isSuccess && searchResult.data.agents.length === 0,
  );
  const projection = api.agents.sessionProjectionFromEvents.useQuery(
    {
      ...queryScope,
      baselineDays: prototype.options.baselineDays,
      ...(search
        ? {
            agentNames:
              searchResult.data?.agents.map((agent) => agent.agentName) ?? [],
          }
        : {}),
    },
    {
      enabled:
        Boolean(projectId) &&
        validWindow &&
        (!search || (searchResult.isSuccess && !noSearchResults)),
      trpc: { context: { skipBatch: true } },
    },
  );
  return {
    ...prototype,
    timeRange,
    setTimeRange,
    scope,
    validWindow,
    search,
    status,
    sort,
    projection,
    environments,
    observedOptions,
    queryFilter,
    agents: projection.data ? prepareAgents(projection.data, status, sort) : [],
    noSearchResults,
    searchTruncated: Boolean(
      search && (searchResult.data?.totalAgents ?? 0) > 25,
    ),
    loading:
      validWindow &&
      !noSearchResults &&
      ((search.length > 0 && searchResult.isPending) || projection.isPending),
    error: (search.length > 0 && searchResult.isError) || projection.isError,
    setSearch: (value: string | null) => {
      if ((value ?? "") !== (query.search ?? ""))
        setQuery({ search: value || undefined });
    },
    setStatus: (value: string) =>
      setQuery({ agentStatus: value === "all" ? undefined : value }),
    setSort: (value: AgentSort) => setQuery({ agentSort: value }),
    setFilters: (filters: typeof queryFilter.searchBarFilterState) => {
      if (!isEqual(filters, queryFilter.searchBarFilterState))
        queryFilter.setFilterState(filters, { origin: "user" });
    },
    zoom: (nextFrom: Date, nextTo: Date, agentName?: string) => {
      if (!(nextFrom < nextTo)) return;
      setQuery(
        {
          dateRange: rangeToString({ from: nextFrom, to: nextTo }),
          ...(agentName ? { search: agentName } : {}),
        },
        "pushIn",
      );
    },
    refresh: async () => {
      if (!projectId || !validWindow) return;
      if ("range" in timeRange) {
        setRefreshKey((key) => key + 1);
        return;
      }
      if (search) await searchResult.refetch();
      if (!noSearchResults) await projection.refetch();
    },
  };
}
