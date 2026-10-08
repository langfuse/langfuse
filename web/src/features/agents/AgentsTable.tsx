import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import isEqual from "lodash/isEqual";
import {
  useQueryParam,
  useQueryParams,
  NumberParam,
  StringParam,
  withDefault,
} from "use-query-params";
import { Bot, RefreshCw } from "lucide-react";
import { DEFAULT_SIDEBAR_IMPLICIT_ENVIRONMENT_CONFIG } from "@langfuse/shared";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { PaginationBar } from "@/src/components/design-system/PaginationBar/PaginationBar";
import {
  Table,
  type AsyncTableData,
} from "@/src/components/design-system/table/Table";
import { createLinkTableColumn } from "@/src/components/design-system/table/columns/createLinkTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import {
  DataTableControls,
  DataTableControlsProvider,
} from "@/src/components/table/data-table-controls";
import { FilterToggleButton } from "@/src/components/table/FilterToggleButton";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import { TableHeaderControls } from "@/src/components/table/table-header-controls";
import {
  useSidebarFilterState,
  buildSidebarFilterSessionContextId,
} from "@/src/features/filters";
import { TableSearchBar, toObservedOptions } from "@/src/features/search-bar";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { useLiveTableDateRange } from "@/src/hooks/useLiveTableDateRange";
import { api } from "@/src/utils/api";
import { compactNumberFormatter, usdFormatter } from "@/src/utils/numbers";
import { buildAgentProfilePath } from "./lib/buildAgentProfilePath";
import {
  AGENTS_FIELD_REGISTRY,
  agentsFilterConfig,
} from "./constants/agentsFilterConfig";

type AgentRow = {
  agentName: string;
  totalTraces: bigint;
  totalObservations?: bigint;
  totalRuns?: bigint;
  totalTokens?: bigint;
  sumCalculatedTotalCost?: number;
  lastSeen?: Date | null;
};

const EMPTY_WINDOW_BOUND = new Date(0);

function prepareTableData(
  rows: AgentRow[],
  hasData: boolean,
  isError: boolean,
): AsyncTableData<AgentRow[]> {
  if (isError)
    return {
      status: "error",
      error: "Agents could not be loaded. Try a smaller time range or refresh.",
    };
  if (hasData) return { status: "success", data: rows };
  return { status: "loading" };
}

export function AgentsTable({ projectId }: { projectId: string }) {
  const [pagination, setPagination] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });
  const paginationState = {
    pageIndex: Number.isFinite(pagination.pageIndex)
      ? Math.max(0, Math.floor(pagination.pageIndex))
      : 0,
    pageSize: Number.isFinite(pagination.pageSize)
      ? Math.max(1, Math.min(100, Math.floor(pagination.pageSize)))
      : 50,
  };
  const [searchQuery, setSearchQuery] = useQueryParam(
    "search",
    withDefault(StringParam, null),
  );
  const { timeRange, setTimeRange } = useTableDateRange(projectId);
  const [refreshKey, setRefreshKey] = useState(0);
  const { range, anchoredTo } = useLiveTableDateRange(timeRange, refreshKey);
  const from = range?.from ?? EMPTY_WINDOW_BOUND;
  const to = range?.to ?? anchoredTo ?? EMPTY_WINDOW_BOUND;
  const isWindowBounded = Boolean(range && anchoredTo);

  const environments = api.projects.environmentFilterOptions.useQuery(
    { projectId, fromTimestamp: range?.from },
    {
      enabled: Boolean(projectId) && isWindowBounded,
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
      onExplicitFilterStateChange: ({ previousFilters, nextFilters }) => {
        if (!isEqual(previousFilters, nextFilters)) {
          setPagination({ pageIndex: 0 });
        }
      },
    },
  );
  const window = {
    projectId,
    from,
    to,
    filter: queryFilter.effectiveFilterState,
  };
  const agents = api.agents.allFromEvents.useQuery(
    {
      ...window,
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
      searchQuery: searchQuery ?? undefined,
    },
    {
      enabled: Boolean(projectId) && isWindowBounded,
      placeholderData: keepPreviousData,
    },
  );
  const metrics = api.agents.metricsFromEvents.useQuery(
    {
      ...window,
      agentNames: agents.data?.agents.map((agent) => agent.agentName) ?? [],
    },
    {
      enabled:
        agents.isSuccess &&
        !agents.isPlaceholderData &&
        (agents.data?.agents.length ?? 0) > 0 &&
        isWindowBounded,
      placeholderData: keepPreviousData,
      trpc: { context: { skipBatch: true } },
    },
  );
  const metricByName = new Map(
    metrics.isPlaceholderData
      ? []
      : metrics.data?.map((metric) => [metric.agentName, metric]),
  );
  // The ranked list owns trace counts even if later metrics see more data.
  const rows: AgentRow[] =
    agents.data?.agents.map((agent) => ({
      ...metricByName.get(agent.agentName),
      ...agent,
    })) ?? [];
  const metricsPending =
    (metrics.isPending || metrics.isPlaceholderData) && !metrics.isError;
  const resolveNumber = (value: bigint | null | undefined) =>
    metricsPending ? { type: "loading" as const } : (value ?? undefined);
  const countFormatter = (value: bigint) =>
    compactNumberFormatter(Number(value));
  const profilePath = (name: string) => {
    return buildAgentProfilePath({
      projectId,
      agentName: name,
      from,
      to,
      filter: queryFilter.effectiveFilterState,
    });
  };
  const columns = [
    createLinkTableColumn<AgentRow>({
      accessorKey: "agentName",
      header: "Agent name",
      size: 240,
      cellClassName: "ph-no-capture",
      headerTooltip: {
        description:
          "A stable name recorded on each observation owned by this agent. Names are case-sensitive.",
      },
      getCell: (name) =>
        name
          ? { type: "link", props: { value: name, path: profilePath(name) } }
          : undefined,
    }),
    createNumberTableColumn<AgentRow, bigint>({
      accessorKey: "totalTraces",
      header: "Traces",
      size: 115,
      formatter: countFormatter,
      headerTooltip: {
        description:
          "Distinct traces with observations carrying this agent name, in the selected window. The list is ordered by this count.",
      },
    }),
    createNumberTableColumn<AgentRow, bigint>({
      accessorKey: "totalObservations",
      header: "Observations",
      size: 135,
      formatter: countFormatter,
      getValue: resolveNumber,
      headerTooltip: {
        description:
          "Distinct observations carrying this agent name in the selected window.",
      },
    }),
    createNumberTableColumn<AgentRow, bigint>({
      accessorKey: "totalRuns",
      header: "Runs",
      size: 110,
      formatter: countFormatter,
      getValue: resolveNumber,
      headerTooltip: {
        description:
          "Distinct AGENT observations carrying this agent name. Other named observation types contribute to traces, usage and cost.",
      },
    }),
    createNumberTableColumn<AgentRow, bigint>({
      accessorKey: "totalTokens",
      header: "Total tokens",
      size: 130,
      formatter: countFormatter,
      getValue: resolveNumber,
      headerTooltip: {
        description:
          "Usage reported by observations carrying the name. Propagate the name to generations to include their tokens.",
      },
    }),
    createNumberTableColumn<AgentRow>({
      accessorKey: "sumCalculatedTotalCost",
      header: "Total cost",
      size: 125,
      formatter: (value) => usdFormatter(value, 2, 6),
      getValue: (value) =>
        metricsPending ? { type: "loading" } : (value ?? undefined),
      headerTooltip: {
        description:
          "Exclusive cost from observations carrying the name. Sub-agent cost does not roll up to the caller. Rewritten observations can temporarily count twice before background merges.",
      },
    }),
    createDateTableColumn<AgentRow>({
      accessorKey: "lastSeen",
      header: "Last seen",
      size: 175,
      getValue: (value) =>
        metricsPending ? { type: "loading" } : (value ?? undefined),
      headerTooltip: {
        description: "Latest named observation within the selected window.",
      },
    }),
  ];
  const tableData = prepareTableData(
    rows,
    Boolean(agents.data),
    agents.isError,
  );
  const hasFilters =
    Boolean(searchQuery) || queryFilter.explicitFilterState.length > 0;

  return (
    <DataTableControlsProvider tableName="agents">
      <div className="flex h-full min-h-0 flex-col">
        <TableHeaderControls
          timeRange={timeRange}
          setTimeRange={(next) => {
            setPagination({ pageIndex: 0 });
            setTimeRange(next);
          }}
        />
        <div className="flex items-center gap-2 px-3 py-2">
          <FilterToggleButton filterState={queryFilter.explicitFilterState} />
          <div className="min-w-0 flex-1">
            <TableSearchBar
              key={`${projectId}:${queryFilter.draftResetKey}`}
              projectId={projectId}
              tableName="agents"
              registry={AGENTS_FIELD_REGISTRY}
              filterState={queryFilter.searchBarFilterState}
              setFilterState={(filters) => {
                if (!isEqual(filters, queryFilter.searchBarFilterState)) {
                  queryFilter.setFilterState(filters, { origin: "user" });
                }
              }}
              observed={toObservedOptions(
                observedOptions,
                environments.isPending,
              )}
              isV4
              search={{
                query: searchQuery,
                type: ["id"],
                setQuery: (query) => {
                  if ((query ?? "") === (searchQuery ?? "")) return;
                  setPagination({ pageIndex: 0 });
                  setSearchQuery(query);
                },
              }}
            />
          </div>
          <Button
            text="Refresh"
            icon={RefreshCw}
            variant="secondary"
            loading={agents.isFetching || metrics.isFetching}
            onClick={async () => {
              if ("range" in timeRange) {
                setRefreshKey((key) => key + 1);
                return;
              }
              await Promise.all([
                agents.refetch(),
                ...(rows.length > 0 ? [metrics.refetch()] : []),
              ]);
            }}
          />
        </div>
        <div className="text-muted-foreground px-3 pb-2 text-xs">
          Window totals · Sorted by traces · Cost and tokens require the agent
          name on each observation.
        </div>
        {!isWindowBounded ? (
          <div className="p-4">
            <Alert variant="info">
              <Alert.Description>
                Select a bounded time range to explore agents.
              </Alert.Description>
            </Alert>
          </div>
        ) : (
          <ResizableFilterLayout>
            <DataTableControls queryFilter={queryFilter} />
            <div className="flex min-h-0 flex-1 flex-col">
              {metrics.isError ? (
                <div className="px-3 pb-2">
                  <Alert variant="destructive">
                    <Alert.Description>
                      Agent metrics could not be loaded. Trace counts are still
                      available.{" "}
                      <Button
                        text="Retry metrics"
                        variant="ghost"
                        onClick={() => metrics.refetch()}
                      />
                    </Alert.Description>
                  </Alert>
                </div>
              ) : null}
              <Table
                tableName="Agents"
                columns={columns}
                data={tableData}
                noResultsMessage={
                  hasFilters || paginationState.pageIndex > 0 ? (
                    "No agents match these filters in the selected window."
                  ) : (
                    <EmptyAgents />
                  )
                }
                rowHeight="m"
              />
              <PaginationBar
                mode="offset"
                totalCount={agents.data?.totalAgents ?? null}
                state={paginationState}
                onChange={setPagination}
                pageSizeOptions={[20, 50, 100]}
              />
            </div>
          </ResizableFilterLayout>
        )}
      </div>
    </DataTableControlsProvider>
  );
}

function EmptyAgents() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-3 px-4 py-10 text-center">
      <Bot className="text-muted-foreground icon-xl" />
      <h2 className="text-foreground text-lg font-bold">
        No agents yet in this window
      </h2>
      <p className="text-muted-foreground text-sm">
        Record a stable agent name on your observations, then select a window
        that includes them. Newly ingested data appears here.
      </p>
      <pre className="bg-muted text-foreground w-full overflow-x-auto rounded-md p-3 text-left text-xs">
        <code>
          {
            'import { startObservation } from "@langfuse/tracing";\nconst agent = startObservation("research", {}, { asType: "agent" });\nagent.otelSpan.setAttribute("langfuse.agent.name", "research");\nagent.end();'
          }
        </code>
      </pre>
      <p className="text-muted-foreground text-xs">
        With a configured Langfuse span processor, set the same attribute on
        child generations and tools to include their usage and cost. A nested
        agent uses its own name.
      </p>
      <Button
        text="Instrumentation docs"
        variant="secondary"
        href="https://langfuse.com/docs/observability/sdk/instrumentation"
      />
    </div>
  );
}
