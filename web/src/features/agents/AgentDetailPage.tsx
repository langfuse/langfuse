import { useRouter } from "next/router";
import {
  NumberParam,
  StringParam,
  useQueryParams,
  withDefault,
} from "use-query-params";
import { LayoutDashboard, List, Network, Wrench } from "lucide-react";
import {
  AGENT_NAME_METADATA_KEY,
  MAX_AGENT_NAME_LENGTH,
  encodeFiltersGeneric,
  decodeFiltersGeneric,
  type FilterState,
} from "@langfuse/shared";
import Page from "@/src/components/layouts/page";
import { Button } from "@/src/components/design-system/Button/Button";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { TableHeaderControls } from "@/src/components/table/table-header-controls";
import { ObservationsEventsTable } from "@/src/features/events/components";
import { EventsOutlierStrip } from "@/src/features/events/components/outlier-strip/EventsOutlierStrip";
import { InternalFeatureBadge } from "@/src/features/feature-flags";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { useLiveTableDateRange } from "@/src/hooks/useLiveTableDateRange";
import {
  RouteParamsPendingFallback,
  useReadyRouteParams,
} from "@/src/hooks/useReadyRouteParams";
import {
  rangeToString,
  type AbsoluteTimeRange,
} from "@/src/utils/date-range-utils";
import { AgentsFeatureGate } from "./AgentsFeatureGate";
import { AgentStats } from "./AgentStats";
import { AgentSkills } from "./AgentSkills";
import { AgentMap } from "./agent-map/AgentMap";
import { buildAgentProfilePath } from "./lib/buildAgentProfilePath";

const RUN_FILTER: FilterState = [
  {
    column: "type",
    type: "stringOptions",
    operator: "any of",
    value: ["AGENT"],
  },
];
const TABS = ["runs", "observations", "skills", "map"] as const;

export default function AgentDetailPage() {
  const route = useReadyRouteParams(["projectId", "agentName"]);
  if (!route.ready) return <RouteParamsPendingFallback />;
  return (
    <AgentsFeatureGate>
      <AgentDetailView
        key={`${route.params.projectId}:${route.params.agentName}`}
        {...route.params}
      />
    </AgentsFeatureGate>
  );
}

function AgentDetailView({
  projectId,
  agentName,
}: {
  projectId: string;
  agentName: string;
}) {
  const { timeRange, setTimeRange } = useTableDateRange(projectId);
  const [, setPagination] = useQueryParams({ page: NumberParam });
  const router = useRouter();
  const scopeFilter = decodeFiltersGeneric(
    typeof router.query.filter === "string" ? router.query.filter : "",
  ).filter((condition) =>
    ["environment", "Environment"].includes(condition.column),
  );
  const { range, anchoredTo } = useLiveTableDateRange(timeRange);
  const to = range?.to ?? anchoredTo;
  const window = range && to ? { from: range.from, to } : null;
  const filter: FilterState = [
    {
      column: "metadata",
      type: "stringObject",
      key: AGENT_NAME_METADATA_KEY,
      operator: "=",
      value: agentName,
    },
  ];
  const dashboardQuery = new URLSearchParams({
    filter: encodeFiltersGeneric([...scopeFilter, ...filter]),
  });
  if (window) dashboardQuery.set("dateRange", rangeToString(window));
  const unsupportedName =
    agentName.trim().length === 0 ||
    [...agentName].length > MAX_AGENT_NAME_LENGTH;

  return (
    <Page
      headerProps={{
        title: agentName,
        breadcrumb: [{ name: "Agents", href: `/project/${projectId}/agents` }],
        actionButtonsRight: (
          <>
            <InternalFeatureBadge />
            <Button
              text="Dashboard"
              variant="secondary"
              icon={LayoutDashboard}
              href={`/project/${projectId}?${dashboardQuery}`}
            />
          </>
        ),
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:overflow-hidden">
        <TableHeaderControls
          timeRange={timeRange}
          setTimeRange={(next) => {
            setPagination({ page: 1 });
            setTimeRange(next);
          }}
        />
        {unsupportedName && (
          <div className="p-4">
            <Alert variant="info">
              <Alert.Title>Unsupported agent name</Alert.Title>
              <Alert.Description>
                Agent names must contain text and be at most{" "}
                {MAX_AGENT_NAME_LENGTH} characters. Longer names cannot be
                grouped reliably in observation metadata. Record a shorter
                stable name to use this view.
              </Alert.Description>
            </Alert>
          </div>
        )}
        {!unsupportedName && window && (
          <AgentProfile
            projectId={projectId}
            agentName={agentName}
            window={window}
            filter={scopeFilter}
          />
        )}
        {!unsupportedName && !window && (
          <div className="p-4">
            <Alert>
              <Alert.Title>Choose a time range</Alert.Title>
              <Alert.Description>
                Agent statistics are calculated only for a selected time window.
              </Alert.Description>
            </Alert>
          </div>
        )}
      </div>
    </Page>
  );
}

function AgentProfile({
  projectId,
  agentName,
  window,
  filter,
}: {
  projectId: string;
  agentName: string;
  window: AbsoluteTimeRange;
  filter: FilterState;
}) {
  const router = useRouter();
  const [{ tab }, setParams] = useQueryParams({
    tab: withDefault(StringParam, "runs"),
    page: NumberParam,
    dateRange: StringParam,
  });
  const onSelectRange = (range: AbsoluteTimeRange) => {
    setParams({ dateRange: rangeToString(range), page: 1 });
  };
  const onTabChange = (next: string) => {
    setParams({ tab: next, page: 1 });
  };
  const currentTab = TABS.find((value) => value === tab) ?? "runs";
  const pulseFilter: FilterState = [
    ...filter,
    {
      column: "metadata",
      type: "stringObject",
      key: AGENT_NAME_METADATA_KEY,
      operator: "=",
      value: agentName,
    },
    ...RUN_FILTER,
  ];
  const selectRuns = (callee: string) => {
    router.push(
      buildAgentProfilePath({
        projectId,
        agentName: callee,
        ...window,
        filter,
        tab: "runs",
      }),
    );
  };

  return (
    <>
      <AgentStats
        projectId={projectId}
        agentName={agentName}
        {...window}
        filter={filter}
      />
      <div className="shrink-0 border-t">
        <div className="flex items-baseline justify-between gap-2 px-4 pt-2">
          <h2 className="text-sm font-bold">Agent runs over time</h2>
          <span className="text-muted-foreground text-xs">
            Select a bar to zoom; use Back to restore the window.
          </span>
        </div>
        <EventsOutlierStrip
          projectId={projectId}
          filterState={pulseFilter}
          fromTimestamp={window.from}
          toTimestamp={window.to}
          fixedMetric="count"
          onSelectRange={onSelectRange}
        />
      </div>
      <div className="flex min-h-[32rem] shrink-0 flex-col md:min-h-0 md:flex-1 md:shrink">
        <Tabs value={currentTab} onValueChange={onTabChange} layout="fill">
          <div className="shrink-0 overflow-x-auto">
            <Tabs.List variant="underline" aria-label="Agent views">
              <Tabs.Trigger value="runs" label="Runs" icon={List} />
              <Tabs.Trigger value="observations" label="Observations" />
              <Tabs.Trigger value="skills" label="Skills" icon={Wrench} />
              <Tabs.Trigger
                value="map"
                label="Agent map · Experimental"
                icon={Network}
              />
            </Tabs.List>
          </div>
          <Tabs.Content value="runs" layout="fill">
            <ObservationsEventsTable
              projectId={projectId}
              agentName={agentName}
              externalDateRange={window}
              externalFilterState={[...filter, ...RUN_FILTER]}
              hideControls
              enablePeekView
              isolateTableState
            />
          </Tabs.Content>
          <Tabs.Content value="observations" layout="fill">
            <ObservationsEventsTable
              projectId={projectId}
              agentName={agentName}
              externalDateRange={window}
              externalFilterState={filter}
              hideControls
              enablePeekView
              isolateTableState
            />
          </Tabs.Content>
          <Tabs.Content value="skills" layout="fill">
            <AgentSkills
              projectId={projectId}
              agentName={agentName}
              {...window}
              filter={filter}
            />
          </Tabs.Content>
          <Tabs.Content value="map" layout="fill">
            <AgentMap
              projectId={projectId}
              agentName={agentName}
              {...window}
              filter={filter}
              onSelectRuns={selectRuns}
            />
          </Tabs.Content>
        </Tabs>
      </div>
    </>
  );
}
