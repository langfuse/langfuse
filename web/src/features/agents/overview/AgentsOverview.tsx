import {
  Activity,
  Bot,
  LayoutGrid,
  List,
  Network,
  RefreshCw,
} from "lucide-react";
import { Accordion } from "@/src/components/design-system/Accordion/Accordion";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import {
  DataTableControls,
  DataTableControlsProvider,
} from "@/src/components/table/data-table-controls";
import { FilterToggleButton } from "@/src/components/table/FilterToggleButton";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import { TableHeaderControls } from "@/src/components/table/table-header-controls";
import { TableSearchBar, toObservedOptions } from "@/src/features/search-bar";
import { AGENTS_FIELD_REGISTRY } from "../constants/agentsFilterConfig";
import { AgentsTable } from "../AgentsTable";
import { PrototypeOptions } from "../prototype-options";
import { AgentOverviewCards } from "./AgentOverviewCards";
import { AgentAttention } from "./AgentAttention";
import { AgentActivity } from "./AgentActivity";
import { AgentRelationships } from "./AgentRelationships";
import { OverviewCoverage } from "./OverviewCoverage";
import { useAgentsOverview } from "./useAgentsOverview";
import { coverageIncomplete } from "./prepareOverview";

export function AgentsOverview({ projectId }: { projectId: string }) {
  const state = useAgentsOverview(projectId);
  const { options, setOptions, projection } = state;
  return (
    <DataTableControlsProvider tableName="agents">
      <div className="flex h-full min-h-0 flex-col">
        <TableHeaderControls
          timeRange={state.timeRange}
          setTimeRange={state.setTimeRange}
        />
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          <FilterToggleButton
            filterState={state.queryFilter.explicitFilterState}
          />
          <div className="min-w-48 flex-1">
            <TableSearchBar
              key={`${projectId}:${state.queryFilter.draftResetKey}`}
              projectId={projectId}
              tableName="agents"
              registry={AGENTS_FIELD_REGISTRY}
              filterState={state.queryFilter.searchBarFilterState}
              setFilterState={state.setFilters}
              observed={toObservedOptions(
                state.observedOptions,
                state.environments.isPending,
              )}
              isV4
              search={{
                query: state.search,
                type: ["id"],
                setQuery: state.setSearch,
              }}
            />
          </div>
          <Button
            text="Refresh"
            icon={RefreshCw}
            variant="secondary"
            loading={projection.isFetching}
            onClick={state.refresh}
          />
          <PrototypeOptions projectId={projectId} />
        </div>
        <ResizableFilterLayout>
          <DataTableControls queryFilter={state.queryFilter} />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2">
              <div className="max-w-full overflow-x-auto">
                <Tabs
                  value={options.overviewView}
                  onValueChange={(value) => {
                    if (
                      value === "cards" ||
                      value === "list" ||
                      value === "activity" ||
                      value === "relationships"
                    )
                      setOptions({ overviewView: value });
                  }}
                >
                  <Tabs.List variant="inset" size="md">
                    <Tabs.Trigger
                      value="cards"
                      label="Cards"
                      icon={LayoutGrid}
                    />
                    <Tabs.Trigger value="list" label="List" icon={List} />
                    <Tabs.Trigger
                      value="activity"
                      label="Activity"
                      icon={Activity}
                    />
                    <Tabs.Trigger
                      value="relationships"
                      label="Relationships"
                      icon={Network}
                    />
                  </Tabs.List>
                </Tabs>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-36">
                  <SelectInput
                    placeholder="Activity status"
                    aria-label="Activity status"
                    value={state.status}
                    onValueChange={state.setStatus}
                    options={[
                      { value: "all", label: "All discovered" },
                      { value: "active", label: "Active in window" },
                      { value: "dormant", label: "Dormant in window" },
                    ]}
                  />
                </div>
                <div className="w-36">
                  <SelectInput
                    placeholder="Sort loaded agents"
                    aria-label="Sort loaded agents"
                    value={state.sort}
                    onValueChange={state.setSort}
                    options={[
                      { value: "attention", label: "Attention first" },
                      { value: "sessions", label: "Most sessions" },
                      { value: "cost", label: "Highest cost" },
                      { value: "name", label: "Agent name" },
                    ]}
                  />
                </div>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
              <OverviewContent state={state} projectId={projectId} />
            </div>
          </div>
        </ResizableFilterLayout>
      </div>
    </DataTableControlsProvider>
  );
}
type OverviewState = ReturnType<typeof useAgentsOverview>;
function OverviewContent({
  state,
  projectId,
}: {
  state: OverviewState;
  projectId: string;
}) {
  if (!state.validWindow)
    return (
      <Alert variant="info">
        <Alert.Description>
          Select a nonempty time range of up to 30 days. Discovery looks back
          separately to include agents with no current activity.
        </Alert.Description>
      </Alert>
    );
  if (state.error)
    return (
      <Alert variant="destructive">
        <Alert.Description>
          Agents could not be loaded. Refresh to try again, or select a smaller
          window.
        </Alert.Description>
      </Alert>
    );
  if (state.loading) return <OverviewLoading />;
  const projection = state.projection.data;
  if (state.noSearchResults || !projection || state.agents.length === 0)
    return (
      <OverviewEmpty
        filtered={Boolean(
          state.search ||
          state.status !== "all" ||
          state.queryFilter.explicitFilterState.length,
        )}
      />
    );
  if (state.options.overviewView === "list") {
    const coverage =
      coverageIncomplete(projection) || state.searchTruncated
        ? "partial coverage"
        : "coverage";
    return (
      <>
        <OverviewView
          state={state}
          projectId={projectId}
          projection={projection}
        />
        <div className="shrink-0">
          <Accordion type="single" collapsible>
            <Accordion.Item value="context">
              <Accordion.Trigger size="sm">
                {state.agents.length} agents · {coverage}
                {state.options.showAttention ? " and insights" : ""}
              </Accordion.Trigger>
              <Accordion.Content>
                <div className="flex max-h-80 flex-col gap-4 overflow-y-auto py-3">
                  <OverviewCoverage projection={projection} />
                  {state.searchTruncated && (
                    <p className="text-muted-foreground text-xs">
                      Showing up to 25 matching agents from the discovery
                      window. Refine the name search to find a specific agent.
                    </p>
                  )}
                  {state.options.showAttention && (
                    <AgentAttention
                      projection={{ ...projection, agents: state.agents }}
                      scope={state.scope}
                    />
                  )}
                </div>
              </Accordion.Content>
            </Accordion.Item>
          </Accordion>
        </div>
      </>
    );
  }
  return (
    <>
      <OverviewCoverage projection={projection} />
      {state.searchTruncated && (
        <p className="text-muted-foreground text-xs">
          Showing up to 25 matching agents from the discovery window. Refine the
          name search to find a specific agent.
        </p>
      )}
      {state.options.showAttention &&
        state.options.overviewView === "cards" && (
          <AgentAttention
            projection={{ ...projection, agents: state.agents }}
            scope={state.scope}
          />
        )}
      <OverviewView
        state={state}
        projectId={projectId}
        projection={projection}
      />
    </>
  );
}
function OverviewView({
  state,
  projectId,
  projection,
}: {
  state: OverviewState;
  projectId: string;
  projection: NonNullable<OverviewState["projection"]["data"]>;
}) {
  const { options, setOptions, agents, scope } = state;
  if (options.overviewView === "cards")
    return (
      <AgentOverviewCards
        agents={agents}
        scope={scope}
        projection={projection}
        metrics={options.cardMetrics}
        showAttention={options.showAttention}
      />
    );
  if (options.overviewView === "list")
    return (
      <AgentsTable
        projectId={projectId}
        overview={{ agents, scope, projection, metrics: options.cardMetrics }}
      />
    );
  if (options.overviewView === "activity")
    return (
      <AgentActivity
        agents={agents}
        scope={scope}
        projection={projection}
        view={options.activityView}
        onViewChange={(activityView) => setOptions({ activityView })}
        onZoom={state.zoom}
      />
    );
  return (
    <AgentRelationships
      agents={agents}
      scope={scope}
      projection={projection}
      mode={options.relationshipView}
      onModeChange={(relationshipView) => setOptions({ relationshipView })}
    />
  );
}
function OverviewLoading() {
  return (
    <div
      role="status"
      aria-label="Loading agents"
      className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="bg-muted/30 h-80 animate-pulse rounded-xl border"
        />
      ))}
    </div>
  );
}
function OverviewEmpty({ filtered }: { filtered: boolean }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-3 py-16 text-center">
      <Bot className="icon-xl text-muted-foreground" />
      <h2 className="text-lg font-bold">
        {filtered ? "No agents match this view" : "Discover your agents"}
      </h2>
      <p className="text-muted-foreground text-sm">
        {filtered
          ? "Try another name, environment or activity status, or widen the selected window."
          : "Record a stable agent name on observations. We discover names in the lookback window and compare their activity in your selected range."}
      </p>
      {!filtered && (
        <>
          <pre className="bg-muted w-full overflow-x-auto rounded-md p-3 text-left text-xs">
            <code>
              {
                'import { startObservation } from "@langfuse/tracing";\nconst agent = startObservation("research", {}, { asType: "agent" });\nagent.otelSpan.setAttribute("langfuse.agent.name", "research");\nagent.end();'
              }
            </code>
          </pre>
          <p className="text-muted-foreground text-xs">
            With a configured Langfuse span processor, use the same name on
            child generations and tools for attribution. A nested agent uses its
            own name.
          </p>
          <Button
            text="Instrumentation docs"
            variant="secondary"
            href="https://langfuse.com/docs/observability/sdk/instrumentation"
          />
        </>
      )}
    </div>
  );
}
