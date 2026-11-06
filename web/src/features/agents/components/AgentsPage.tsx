import {
  Bot,
  LayoutGrid,
  RefreshCw,
  Table as TableIcon,
} from "@langfuse/icons";
import Page from "@/src/components/layouts/Page";
import { PageHeaderControlsPortal } from "@/src/components/layouts/page-header-controls-slot";
import { ErrorPage } from "@/src/components/error-page";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import {
  DataTableControls,
  DataTableControlsProvider,
} from "@/src/components/table/data-table-controls";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { StickySearchableTableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import { TableHeaderControls } from "@/src/components/table/TableHeaderControls";
import { TableSearchBar } from "@/src/features/search-bar/components/TableSearchBar";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useCanViewAgents } from "../agentsAccess";
import {
  agentsFilterConfig,
  AGENTS_FIELD_REGISTRY,
} from "../config/agentFilters";
import {
  AGENT_SORT_OPTIONS,
  useAgentsListState,
} from "../hooks/useAgentsListState";
import { useAgentsTable } from "../hooks/useAgentsTable";
import { AgentPagination } from "./AgentPagination";
import { AgentGalleryCard } from "./AgentGalleryCard";
import { AgentQueryError } from "./AgentQueryError";
import { AgentsTable } from "./AgentsTable";

export function AgentsPage({ projectId }: { projectId: string }) {
  const canView = useCanViewAgents(projectId);
  return canView ? (
    <AgentsList projectId={projectId} />
  ) : (
    <ErrorPage title="Page not found" message="This page is not available." />
  );
}

function AgentsList({ projectId }: { projectId: string }) {
  const state = useAgentsListState(projectId);
  const table = useAgentsTable(state.scope);
  const { query, queryFilter, scopeState } = state;
  const error = scopeState.error ?? state.filterError;
  const content = (() => {
    if (error)
      return (
        <div className="p-4">
          <Alert variant="warning">
            <Alert.Description>{error}</Alert.Description>
          </Alert>
        </div>
      );
    if (query.isError)
      return (
        <AgentQueryError
          retry={() => {
            query.refetch();
          }}
        />
      );
    if (
      state.view === "table" &&
      (query.isPending || query.data.items.length > 0)
    )
      return (
        <AgentsTable
          table={table}
          data={
            query.isPending
              ? { status: "loading" }
              : { status: "success", data: query.data.items }
          }
          orderBy={{
            column: state.sort,
            order: state.direction === "asc" ? "ASC" : "DESC",
          }}
          setOrderBy={(next) =>
            state.setRoute({
              sort: AGENT_SORT_OPTIONS.some(
                (option) => option.value === next?.column,
              )
                ? next?.column
                : undefined,
              direction: next?.order.toLowerCase(),
              page: undefined,
            })
          }
        />
      );
    if (query.isPending)
      return (
        <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-60 rounded-lg" />
          ))}
        </div>
      );
    if (query.data.items.length > 0)
      return (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {query.data.items.map((agent) => (
              <AgentGalleryCard
                key={`${agent.identity.kind}:${agent.identity.value}`}
                agent={agent}
                scope={state.scope}
              />
            ))}
          </div>
        </div>
      );
    return (
      <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
        <Bot size="xl" color="muted" />
        <h2 className="text-base font-bold">No agents found</h2>
        <p className="text-muted-foreground max-w-lg text-sm">
          Try another time range or update your filters. Agents appear when an
          agent observation is recorded in this project.
        </p>
        {(state.search || queryFilter.explicitFilterState.length > 0) && (
          <Button
            text="Clear search and filters"
            variant="secondary"
            onClick={state.clear}
          />
        )}
      </div>
    );
  })();

  return (
    <Page
      headerProps={{
        title: "Agents",
        titleBadges: <Badge text="Preview" color="amber" />,
        help: {
          description:
            "Agents observed in your telemetry. Inspect their activity, conversations, model usage, and skills in one project.",
          href: "https://langfuse.com/docs/observability/features/agents",
        },
      }}
    >
      <DataTableControlsProvider tableName={agentsFilterConfig.tableName}>
        <div className="ph-no-capture flex h-full min-h-0 w-full flex-col">
          <TableHeaderControls
            timeRange={scopeState.timeRange}
            setTimeRange={(range) => {
              scopeState.setTimeRange(range);
              state.setRoute({ page: undefined });
            }}
          />
          <PageHeaderControlsPortal>
            <div className="ph-no-capture contents">
              <IconButton
                icon={RefreshCw}
                label="Refresh"
                variant="outline"
                onClick={state.refresh}
                aria-busy={query.isFetching}
              />
            </div>
          </PageHeaderControlsPortal>
          <StickySearchableTableFilterLayout
            search={
              <TableSearchBar
                size="large"
                key={queryFilter.draftResetKey}
                isV4
                filterState={queryFilter.searchBarFilterState}
                setFilterState={state.setFilters}
                search={{ query: state.search, setQuery: state.setSearch }}
                projectId={projectId}
                tableName={agentsFilterConfig.tableName}
                observed={state.observed}
                registry={AGENTS_FIELD_REGISTRY}
              />
            }
            toolbar={
              <DataTableToolbar
                tableName={agentsFilterConfig.tableName}
                isV4
                rowClassName="my-1"
                filterState={queryFilter.explicitFilterState}
                currentSearchQuery={state.search}
                columns={table.columns}
                columnVisibility={
                  state.view === "table" ? table.columnVisibility : undefined
                }
                setColumnVisibility={
                  state.view === "table" ? table.setColumnVisibility : undefined
                }
                columnOrder={table.columnOrder}
                setColumnOrder={table.setColumnOrder}
                viewModeToggle={
                  <Tabs
                    activationMode="manual"
                    value={state.view}
                    onValueChange={(view) => state.setRoute({ view })}
                  >
                    <Tabs.List
                      variant="inset"
                      size="md"
                      aria-label="Agent view"
                    >
                      <Tabs.Trigger
                        value="table"
                        icon={TableIcon}
                        label="Table"
                      />
                      <Tabs.Trigger
                        value="gallery"
                        icon={LayoutGrid}
                        label="Gallery"
                      />
                    </Tabs.List>
                  </Tabs>
                }
                toolbarSettings={
                  state.view === "gallery" ? (
                    <SelectInput
                      aria-label="Sort agents"
                      value={state.sort}
                      onValueChange={(sort) =>
                        state.setRoute({
                          sort,
                          direction: undefined,
                          page: undefined,
                        })
                      }
                      options={AGENT_SORT_OPTIONS}
                      placeholder="Sort agents"
                    />
                  ) : undefined
                }
              />
            }
          >
            <DataTableControls
              key={queryFilter.draftResetKey}
              queryFilter={queryFilter}
            />
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {state.environmentError && (
                <p className="text-muted-foreground px-4 py-2 text-xs">
                  Environment suggestions are unavailable. You can still enter
                  an environment in search.
                </p>
              )}
              {content}
              <AgentPagination
                totalCount={query.data?.totalCount ?? null}
                state={{ pageIndex: state.page, pageSize: state.pageSize }}
                pageSizeOptions={[10, 20, 50, 100]}
                onChange={(next) =>
                  state.setRoute({
                    page: String(next.pageIndex + 1),
                    pageSize: next.pageSize,
                  })
                }
              />
            </div>
          </StickySearchableTableFilterLayout>
        </div>
      </DataTableControlsProvider>
    </Page>
  );
}
