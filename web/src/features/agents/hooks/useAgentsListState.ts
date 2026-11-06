import { NumberParam, StringParam, useQueryParams } from "use-query-params";
import { type FilterState } from "@langfuse/shared";
import {
  AgentListFilterListSchema,
  type AgentEnvironmentFilter,
  type AgentSort,
} from "@langfuse/shared/agents";
import {
  useSidebarFilterPresentation,
  useSidebarFilterStateCore,
} from "@/src/features/filters/hooks/useSidebarFilterState";
import { toObservedOptions } from "@/src/features/search-bar/lib/observed-options";
import { api } from "@/src/utils/api";
import { agentsFilterConfig } from "../config/agentFilters";
import { agentPage } from "./agentsQuery";
import { useAgentEnvironments, useAgentList } from "./useAgentQueries";
import { useAgentsScope } from "./useAgentsScope";

export const AGENT_SORT_OPTIONS: { value: AgentSort; label: string }[] = [
  { value: "lastSeen", label: "Last seen" },
  { value: "runs", label: "Most agent runs" },
  { value: "cost", label: "Highest model cost" },
  { value: "name", label: "Name" },
];

export function useAgentsListState(projectId: string) {
  const utils = api.useUtils();
  const scopeState = useAgentsScope(projectId);
  const [route, setRoute] = useQueryParams({
    search: StringParam,
    sort: StringParam,
    direction: StringParam,
    view: StringParam,
    page: StringParam,
    pageSize: NumberParam,
  });
  const sort =
    AGENT_SORT_OPTIONS.find((option) => option.value === route.sort)?.value ??
    "lastSeen";
  const defaultDirection = sort === "name" ? "asc" : "desc";
  const direction =
    route.direction === "asc" || route.direction === "desc"
      ? route.direction
      : defaultDirection;
  const view = route.view === "table" ? "table" : "gallery";
  const page = agentPage(route.page ?? undefined);
  const pageSize =
    typeof route.pageSize === "number" &&
    [10, 20, 50, 100].includes(route.pageSize)
      ? route.pageSize
      : 50;
  const search = route.search ?? "";
  const filterCore = useSidebarFilterStateCore(agentsFilterConfig, {
    stateLocation: "url",
    isV4: true,
    onExplicitFilterStateChange: () => setRoute({ page: undefined }),
  });
  const environments = useAgentEnvironments(
    {
      projectId,
      from: scopeState.scope.from,
      to: scopeState.scope.to,
    },
    scopeState.enabled,
  );
  const facetOptions = { environment: environments.data ?? [] };
  const queryFilter = useSidebarFilterPresentation(
    filterCore,
    agentsFilterConfig,
    facetOptions,
    { loading: environments.isPending, isV4: true },
  );
  const parsedFilters = AgentListFilterListSchema.safeParse(
    filterCore.filterState,
  );
  const filters = parsedFilters.success ? parsedFilters.data : [];
  const scope = {
    ...scopeState.scope,
    environment: null,
    environmentFilter: filters.filter(
      (filter): filter is AgentEnvironmentFilter =>
        filter.column === "environment",
    ),
  };
  const query = useAgentList(
    {
      ...scope,
      environmentFilter: undefined,
      filter: filters,
      page,
      pageSize,
      search,
      sort,
      direction,
    },
    scopeState.enabled && parsedFilters.success,
  );

  return {
    scopeState,
    scope,
    query,
    activityInput: {
      ...scope,
      environmentFilter: undefined,
      filter: filters,
      search,
    },
    enabled: scopeState.enabled && parsedFilters.success,
    queryFilter,
    filterError: parsedFilters.success
      ? null
      : "Update or clear unsupported agent filters.",
    observed: toObservedOptions(facetOptions, environments.isPending),
    environmentError: environments.isError,
    view,
    sort,
    direction,
    search,
    page,
    pageSize,
    setRoute,
    setFilters: (filters: FilterState) => filterCore.setFilterState(filters),
    setSearch: (value: string | null) =>
      setRoute({ search: value || undefined, page: undefined }),
    refresh: () => {
      if (!scopeState.refreshWindow()) {
        Promise.all([
          query.refetch(),
          environments.refetch(),
          utils.agents.activity.invalidate({ projectId }),
          utils.agents.listActivity.invalidate({ projectId }),
        ]);
      }
    },
    clear: () => {
      queryFilter.clearAll();
      setRoute({ search: undefined, page: undefined });
    },
  };
}
