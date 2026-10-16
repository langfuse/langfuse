import { useState } from "react";
import { useRouter } from "next/router";
import {
  NumberParam,
  StringParam,
  useQueryParams,
  withDefault,
} from "use-query-params";
import {
  LayoutDashboard,
  List,
  Network,
  Wrench,
  MessagesSquare,
  BookOpen,
  CircleAlert,
} from "lucide-react";
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
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Skeleton } from "@/src/components/ui/skeleton";
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
import { api } from "@/src/utils/api";
import { AgentsFeatureGate } from "./AgentsFeatureGate";
import { AgentStats } from "./AgentStats";
import { AgentSkills } from "./AgentSkills";
import { AgentSkillsContext } from "./AgentSkillsContext";
import { AgentMap } from "./agent-map/AgentMap";
import { AgentIdentity, AgentAppearancePicker } from "./appearance";
import {
  PrototypeOptions,
  useAgentsPrototypeOptions,
} from "./prototype-options";
import { AgentSessions } from "./profile/AgentSessions";
import { AgentTools } from "./profile/AgentTools";
import { AgentToolsContext } from "./profile/AgentToolsContext";
import { AgentProfileChart } from "./profile/AgentProfileChart";
import { AgentComparison } from "./profile/AgentComparison";
import { AgentCoverage } from "./profile/AgentCoverage";
import { AgentProfileWorkspace } from "./profile/AgentProfileWorkspace";
import { type AgentProfileTab } from "./profile/prepareAgentProfile";
import { buildAgentProfilePath } from "./lib/buildAgentProfilePath";
import { commitAgentDateRange } from "./lib/commitAgentDateRange";
import { encodeAgentOptions } from "./prototype-options/options";

const RUN_FILTER: FilterState = [
  {
    column: "type",
    type: "stringOptions",
    operator: "any of",
    value: ["AGENT"],
  },
];
const TABS: readonly AgentProfileTab[] = [
  "sessions",
  "tools",
  "skills",
  "runs",
  "observations",
  "map",
];

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
  const { timeRange } = useTableDateRange(projectId);
  const { options } = useAgentsPrototypeOptions(projectId);
  const [, setPagination] = useQueryParams({
    page: NumberParam,
    peek: StringParam,
    dateRange: StringParam,
  });
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
  const overviewQuery = new URLSearchParams(encodeAgentOptions(options));
  if (scopeFilter.length)
    overviewQuery.set("filter", encodeFiltersGeneric(scopeFilter));
  if (window) {
    dashboardQuery.set("dateRange", rangeToString(window));
    overviewQuery.set("dateRange", rangeToString(window));
  }
  const unsupportedName =
    agentName.trim().length === 0 ||
    [...agentName].length > MAX_AGENT_NAME_LENGTH;
  return (
    <Page
      headerProps={{
        title: agentName,
        divider: false,
        titleBadges: (
          <AgentIdentity
            projectId={projectId}
            agentName={agentName}
            size="md"
            showName={false}
          />
        ),
        breadcrumb: [
          {
            name: "Agents",
            href: `/project/${projectId}/agents?${overviewQuery}`,
          },
        ],
        actionButtonsRight: (
          <>
            <InternalFeatureBadge />
            <AgentAppearancePicker
              projectId={projectId}
              agentName={agentName}
            />
            <PrototypeOptions projectId={projectId} />
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
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <TableHeaderControls
          timeRange={timeRange}
          setTimeRange={(next) => {
            commitAgentDateRange({
              projectId,
              range: next,
              setQuery: setPagination,
            });
          }}
        />
        {unsupportedName && (
          <div className="p-4">
            <Alert variant="info">
              <Alert.Title>Unsupported agent name</Alert.Title>
              <Alert.Description>
                Agent names must contain text and be at most{" "}
                {MAX_AGENT_NAME_LENGTH} characters. Record a shorter stable name
                to use this view.
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
                Agent statistics require a selected time window.
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { options } = useAgentsPrototypeOptions(projectId);
  const [{ tab }, setParams] = useQueryParams({
    tab: withDefault(StringParam, "sessions"),
    page: NumberParam,
    dateRange: StringParam,
    peek: StringParam,
    agentSignal: StringParam,
    agentTool: StringParam,
    agentSkill: StringParam,
    agentSessionSearch: StringParam,
  });
  const currentTab = TABS.find((value) => value === tab) ?? "sessions";
  const projection = api.agents.sessionProjectionFromEvents.useQuery(
    {
      projectId,
      agentNames: [agentName],
      ...window,
      filter,
      baselineDays: options.baselineDays,
    },
    {
      trpc: { context: { skipBatch: true } },
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  );
  const onSelectRange = (range: AbsoluteTimeRange) =>
    setParams({ dateRange: rangeToString(range), page: 1, peek: undefined });
  const onTabChange = (next: string) => {
    setDetailsOpen(false);
    setParams({ tab: next, page: 1, peek: undefined });
  };
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
        prototypeOptions: options,
      }),
    );
  };
  const agent = projection.data?.agents.find(
    (item) => item.agentName === agentName,
  );
  const signalCount = options.showAttention ? (agent?.signals.length ?? 0) : 0;
  const coverage = projection.data?.coverage;
  const partialCoverage =
    coverage &&
    (coverage.agentsTruncated ||
      coverage.sessionsTruncated ||
      coverage.rowsTruncated ||
      coverage.groupsTruncated ||
      !coverage.historyComplete);
  const selectSignal = (kind: string) => {
    setDetailsOpen(false);
    setParams({
      tab: "sessions",
      agentSignal: kind,
      agentTool: undefined,
      agentSkill: undefined,
      agentSessionSearch: undefined,
      page: 1,
      peek: undefined,
    });
  };
  const pulseChart =
    options.profileChart === "pulse" ? (
      <div className="shrink-0 border-t">
        <h2 className="px-4 pt-2 text-sm font-bold">
          Agent invocations over time
        </h2>
        <EventsOutlierStrip
          projectId={projectId}
          filterState={pulseFilter}
          fromTimestamp={window.from}
          toTimestamp={window.to}
          fixedMetric="count"
          onSelectRange={onSelectRange}
        />
      </div>
    ) : null;

  return (
    <>
      {projection.isPending && (
        <div className="shrink-0 px-4 py-2">
          <Skeleton className="h-5 w-40" />
        </div>
      )}
      {projection.isError && (
        <div className="shrink-0 p-3">
          <Alert variant="destructive">
            <Alert.Description>
              Agent activity could not be loaded. Try a smaller window or retry.
              <Button
                text="Retry"
                variant="secondary"
                onClick={() => {
                  projection.refetch();
                }}
              />
            </Alert.Description>
          </Alert>
        </div>
      )}
      <Tabs value={currentTab} onValueChange={onTabChange} layout="fill">
        <AgentProfileWorkspace
          detailsOpen={detailsOpen}
          onDetailsOpenChange={setDetailsOpen}
          status={
            <>
              {signalCount > 0 && (
                <Button
                  text={`${signalCount} change${signalCount === 1 ? "" : "s"}`}
                  icon={CircleAlert}
                  variant="secondary"
                  size="sm"
                  onClick={() => setDetailsOpen(true)}
                />
              )}
              {partialCoverage && <Badge color="yellow" text="Partial data" />}
            </>
          }
          details={
            projection.data ? (
              <div className="flex flex-col gap-5">
                <AgentStats
                  agentName={agentName}
                  projection={projection.data}
                />
                {options.profileChart === "contextual" && (
                  <AgentProfileChart
                    projection={projection.data}
                    agentName={agentName}
                    tab={currentTab}
                    onSelectRange={onSelectRange}
                  />
                )}
                {pulseChart}
                {currentTab === "tools" && (
                  <AgentToolsContext
                    agentName={agentName}
                    projection={projection.data}
                  />
                )}
                {currentTab === "skills" && (
                  <AgentSkillsContext
                    agentName={agentName}
                    projection={projection.data}
                  />
                )}
                {options.showAttention && (
                  <AgentComparison
                    projectId={projectId}
                    agentName={agentName}
                    projection={projection.data}
                    onSelectSignal={selectSignal}
                  />
                )}
                <AgentCoverage coverage={projection.data.coverage} />
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <p className="text-muted-foreground text-sm">
                  Agent details load with the selected interval.
                </p>
                {pulseChart}
              </div>
            )
          }
          navigation={
            <div className="shrink-0 overflow-x-auto">
              <Tabs.List variant="underline" aria-label="Agent views">
                <Tabs.Trigger
                  value="sessions"
                  label="Sessions"
                  icon={MessagesSquare}
                />
                <Tabs.Trigger value="tools" label="Tools" icon={Wrench} />
                <Tabs.Trigger value="skills" label="Skills" icon={BookOpen} />
                <Tabs.Trigger value="runs" label="Invocations" icon={List} />
                <Tabs.Trigger value="observations" label="Observations" />
                <Tabs.Trigger
                  value="map"
                  label="Relationships"
                  icon={Network}
                />
              </Tabs.List>
            </div>
          }
        >
          <Tabs.Content value="sessions" layout="fill">
            {projection.data && (
              <AgentSessions
                key={`${agentName}:${window.from.getTime()}:${window.to.getTime()}`}
                projectId={projectId}
                agentName={agentName}
                projection={projection.data}
              />
            )}
          </Tabs.Content>
          <Tabs.Content value="tools" layout="fill">
            {projection.data && (
              <AgentTools
                agentName={agentName}
                projection={projection.data}
                onSelectTool={(name) => {
                  setDetailsOpen(false);
                  setParams({
                    tab: "sessions",
                    agentTool: name,
                    agentSkill: undefined,
                    agentSignal: undefined,
                    agentSessionSearch: undefined,
                    page: 1,
                  });
                }}
              />
            )}
          </Tabs.Content>
          <Tabs.Content value="skills" layout="fill">
            {projection.data && (
              <AgentSkills
                projectId={projectId}
                agentName={agentName}
                projection={projection.data}
                onSelectSkill={(name) => {
                  setDetailsOpen(false);
                  setParams({
                    tab: "sessions",
                    agentSkill: name,
                    agentTool: undefined,
                    agentSignal: undefined,
                    agentSessionSearch: undefined,
                    page: 1,
                  });
                }}
              />
            )}
          </Tabs.Content>
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
          <Tabs.Content value="map" layout="fill">
            <AgentMap
              projectId={projectId}
              agentName={agentName}
              {...window}
              filter={filter}
              onSelectRuns={selectRuns}
              prototypeOptions={options}
            />
          </Tabs.Content>
        </AgentProfileWorkspace>
      </Tabs>
    </>
  );
}
