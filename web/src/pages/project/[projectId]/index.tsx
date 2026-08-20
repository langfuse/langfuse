import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import { TimeRangePicker } from "@/src/components/date-picker";
import { PageHeaderControlsPortal } from "@/src/components/layouts/page-header-controls-slot";
import { useDashboardFilterOptions } from "@/src/hooks/useDashboardFilterOptions";
import { PopoverFilterBuilder } from "@/src/features/filters/components/filter-builder";
import {
  LANGFUSE_HOME_DASHBOARD_DEFINITION,
  LANGFUSE_HOME_DASHBOARD_ID,
  type ColumnDefinition,
  type FilterState,
} from "@langfuse/shared";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { StringParam, useQueryParam } from "use-query-params";
import {
  DASHBOARD_AGGREGATION_OPTIONS,
  toAbsoluteTimeRange,
} from "@/src/utils/date-range-utils";
import { useDashboardDateRange } from "@/src/hooks/useDashboardDateRange";
import { useDebounce } from "@/src/hooks/useDebounce";
import SetupTracingButton from "@/src/features/setup/components/SetupTracingButton";
import { useEntitlementLimit } from "@/src/features/entitlements/hooks";
import Page from "@/src/components/layouts/page";
import { MultiSelect } from "@/src/features/filters/components/multi-select";
import {
  convertSelectedEnvironmentsToFilter,
  useEnvironmentFilter,
} from "@/src/hooks/useEnvironmentFilter";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { type ViewVersion } from "@langfuse/shared/query";
import { useEnvironmentFilterOptionsCache } from "@/src/hooks/use-environment-filter-options-cache";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import {
  DashboardQuerySchedulerProvider,
  getDashboardQuerySchedulerMaxConcurrent,
  useDashboardQueryScheduler,
} from "@/src/hooks/useDashboardQueryScheduler";
import Link from "next/link";
import { PencilIcon } from "lucide-react";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { Button } from "@/src/components/ui/button";
import { DashboardGrid } from "@/src/features/widgets/components/DashboardGrid";
import { HomeDashboardSelect } from "@/src/features/dashboard/components/HomeDashboardSelect";

export default function Dashboard() {
  const router = useRouter();
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const projectId = router.query.projectId as string;
  const { timeRange, setTimeRange } = useDashboardDateRange();
  const { isBetaEnabled } = useV4Beta();
  const metricsVersion: ViewVersion = isBetaEnabled ? "v2" : "v1";

  const absoluteTimeRange = useMemo(
    () => toAbsoluteTimeRange(timeRange) ?? undefined,
    [timeRange],
  );

  const lookbackLimit = useEntitlementLimit("data-access-days");

  const [userFilterState, setUserFilterState] = useQueryFilterState(
    [],
    "dashboard",
    projectId,
  );

  const { nameOptions, tagsOptions } = useDashboardFilterOptions({
    projectId,
    isBetaEnabled,
    timeRange,
  });

  const environmentOptionsState = useEnvironmentFilterOptionsCache({
    projectId,
    timeRange,
  });
  const environmentOptions: string[] =
    environmentOptionsState.environmentOptions;

  const { selectedEnvironments, setSelectedEnvironments } =
    useEnvironmentFilter(environmentOptions, projectId);

  const filterColumns: ColumnDefinition[] = [
    {
      name: "Trace Name",
      id: "traceName",
      type: "stringOptions",
      options: nameOptions,
      internal: "internalValue",
    },
    {
      name: "Tags",
      id: "tags",
      type: "arrayOptions",
      options: tagsOptions,
      internal: "internalValue",
    },
    {
      name: "User",
      id: "user",
      type: "string",
      internal: "internalValue",
    },
    {
      name: "Release",
      id: "release",
      type: "string",
      internal: "internalValue",
    },
    {
      name: "Version",
      id: "version",
      type: "string",
      internal: "internalValue",
    },
  ];

  const dashboardTimeRangePresets = DASHBOARD_AGGREGATION_OPTIONS;

  const environmentFilter = useMemo(
    () =>
      convertSelectedEnvironmentsToFilter(
        ["environment"],
        selectedEnvironments,
      ),
    [selectedEnvironments],
  );

  const isDashboardDataReady = environmentOptionsState.isReady;

  // Home renders the project's selected dashboard (Project.homeDashboardId);
  // unset/missing pointers resolve server-side to the Langfuse-curated
  // default. Fall back to the shared constant so Home still renders when the
  // curated row does not exist yet (e.g. worker has not run against this DB).
  const homeDashboard = api.dashboard.getHomeDashboard.useQuery(
    { projectId },
    { enabled: Boolean(projectId), retry: false },
  );
  const appliedDefaultId =
    homeDashboard.data?.homeDashboardId ?? LANGFUSE_HOME_DASHBOARD_ID;

  // Selecting in the picker "peeks" a dashboard on Home — tracked in the URL
  // (?dashboard=...) so the state is explicit and linkable; the bare URL
  // always shows the project default. "Set default" persists for the project.
  const [peekParam, setPeekParam] = useQueryParam("dashboard", StringParam);
  const peekId = peekParam && peekParam !== appliedDefaultId ? peekParam : null;
  const setPeekId = useCallback(
    (id: string | null) => {
      // replaceIn: peeking is view state, not a navigation history entry
      setPeekParam(id ?? undefined, "replaceIn");
    },
    [setPeekParam],
  );
  const peekQuery = api.dashboard.getDashboard.useQuery(
    { projectId, dashboardId: peekId ?? "" },
    { enabled: Boolean(projectId) && Boolean(peekId), retry: false },
  );

  const displayedDashboard = peekId
    ? (peekQuery.data ?? null)
    : (homeDashboard.data?.dashboard ?? null);
  const dashboardId =
    displayedDashboard?.id ?? peekId ?? LANGFUSE_HOME_DASHBOARD_ID;
  const dashboardName = displayedDashboard?.name ?? "Langfuse Home";
  const dashboardOwner = displayedDashboard?.owner ?? "LANGFUSE";
  // Show a loading state until the home resolution (or peek fetch) settles —
  // rendering the curated fallback early would flash the wrong layout and
  // fire its widget queries whenever the project default is a different
  // dashboard. The constant fallback only renders once the query has settled
  // without a dashboard (curated row missing / no read access).
  const isResolvingDashboard = peekId
    ? peekQuery.isPending
    : homeDashboard.isPending;

  const hasRbacCUDAccess = useHasProjectAccess({
    projectId,
    scope: "dashboards:CUD",
  });

  // Silent on success: the "Set default" button disappearing is the feedback.
  const setHomeDashboard = api.dashboard.setHomeDashboard.useMutation({
    onSuccess: () => {
      utils.dashboard.getHomeDashboard.invalidate();
      setPeekId(null);
    },
    onError: (e) => {
      showErrorToast("Failed to set the default Home dashboard", e.message);
    },
  });

  // Usage analytics: which dashboard Home actually shows (default vs peek)
  const viewedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!displayedDashboard || viewedRef.current === displayedDashboard.id)
      return;
    viewedRef.current = displayedDashboard.id;
    capture("dashboard:home_dashboard_viewed", {
      dashboard_id: displayedDashboard.id,
      dashboard_owner: displayedDashboard.owner,
      is_peek: Boolean(peekId),
      is_curated_default: !peekId && !homeDashboard.data?.homeDashboardId,
    });
  }, [
    displayedDashboard,
    peekId,
    homeDashboard.data?.homeDashboardId,
    capture,
  ]);

  // Home is a viewing surface: no in-place editing (that lives in the
  // Dashboards section, one pencil click away).
  const definition =
    displayedDashboard?.definition ?? LANGFUSE_HOME_DASHBOARD_DEFINITION;

  // The dashboard's saved filters apply as the base (like the detail page),
  // with Home's own user/environment filters on top.
  const gridFilterState: FilterState = useMemo(
    () => [
      ...(displayedDashboard?.filters ?? []),
      ...userFilterState,
      ...environmentFilter,
    ],
    [displayedDashboard?.filters, userFilterState, environmentFilter],
  );

  const getWidgetSchedulerId = useCallback(
    (widgetPlacementId: string) =>
      `${projectId}:${dashboardId}:${widgetPlacementId}`,
    [projectId, dashboardId],
  );

  const schedulerResetKey = useMemo(() => {
    return [
      projectId,
      dashboardId,
      metricsVersion,
      absoluteTimeRange?.from?.toISOString() ?? "",
      absoluteTimeRange?.to?.toISOString() ?? "",
      JSON.stringify(userFilterState),
      selectedEnvironments.join(","),
    ].join("|");
  }, [
    absoluteTimeRange?.from,
    absoluteTimeRange?.to,
    dashboardId,
    metricsVersion,
    projectId,
    selectedEnvironments,
    userFilterState,
  ]);

  const scheduler = useDashboardQueryScheduler({
    maxConcurrent: getDashboardQuerySchedulerMaxConcurrent(timeRange),
    resetKey: schedulerResetKey,
  });

  return (
    <DashboardQuerySchedulerProvider
      scheduler={scheduler}
      shouldBucketQueriesByTimeRange={!("from" in timeRange)}
    >
      <Page
        withPadding
        scrollable
        headerProps={{
          title: "Home",
          actionButtonsLeft: (
            <>
              <MultiSelect
                title="Environment"
                label="Env"
                values={selectedEnvironments}
                onValueChange={useDebounce(setSelectedEnvironments)}
                options={environmentOptions.map((env) => ({
                  value: env,
                }))}
                className="my-0 w-auto overflow-hidden"
              />
              <PopoverFilterBuilder
                columns={filterColumns}
                filterState={userFilterState}
                onChange={useDebounce(setUserFilterState)}
                // Analytics (LFE-10781): project-home dashboard filter — a
                // v3/legacy surface (not the v4 events table).
                tableName="home-dashboard"
                isV4={false}
              />
            </>
          ),
          actionButtonsRight: (
            <>
              <HomeDashboardSelect
                projectId={projectId}
                value={dashboardId}
                defaultDashboardId={appliedDefaultId}
                onValueChange={(id) => {
                  capture("dashboard:home_dashboard_peeked", {
                    dashboard_id: id,
                    is_default: id === appliedDefaultId,
                  });
                  setPeekId(id === appliedDefaultId ? null : id);
                }}
                currentDashboardName={dashboardName}
              />
              {Boolean(peekId) && hasRbacCUDAccess && (
                <Button
                  variant="outline"
                  loading={setHomeDashboard.isPending}
                  title="Show this dashboard on Home for everyone in this project"
                  onClick={() => {
                    capture("dashboard:home_dashboard_set_default", {
                      dashboard_id: dashboardId,
                      source: "home_selector",
                    });
                    setHomeDashboard.mutate({
                      projectId,
                      dashboardId:
                        dashboardId === LANGFUSE_HOME_DASHBOARD_ID
                          ? null
                          : dashboardId,
                    });
                  }}
                >
                  Set default
                </Button>
              )}
              <Button
                variant="outline"
                size="icon"
                title="Edit this dashboard in Dashboards"
                asChild
              >
                <Link
                  href={`/project/${projectId}/dashboards/${encodeURIComponent(dashboardId)}`}
                  onClick={() =>
                    capture("dashboard:home_edit_pencil_click", {
                      dashboard_id: dashboardId,
                      dashboard_owner: dashboardOwner,
                    })
                  }
                >
                  <PencilIcon className="h-4 w-4" />
                  <span className="sr-only">
                    Edit this dashboard in Dashboards
                  </span>
                </Link>
              </Button>
              <SetupTracingButton />
            </>
          ),
        }}
      >
        <PageHeaderControlsPortal>
          <TimeRangePicker
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            timeRangePresets={dashboardTimeRangePresets}
            className="my-0 max-w-full overflow-x-auto"
            triggerClassName="px-2"
            disabled={
              lookbackLimit
                ? {
                    before: new Date(
                      new Date().getTime() -
                        lookbackLimit * 24 * 60 * 60 * 1000,
                    ),
                  }
                : undefined
            }
          />
        </PageHeaderControlsPortal>
        {!isDashboardDataReady || isResolvingDashboard ? (
          <NoDataOrLoading isLoading />
        ) : (
          <DashboardGrid
            widgets={definition.widgets}
            onChange={() => undefined}
            canEdit={false}
            dashboardId={dashboardId}
            projectId={projectId}
            dateRange={absoluteTimeRange}
            filterState={gridFilterState}
            onDeleteWidget={() => undefined}
            dashboardOwner={dashboardOwner}
            getWidgetSchedulerId={getWidgetSchedulerId}
            readOnly
          />
        )}
      </Page>
    </DashboardQuerySchedulerProvider>
  );
}
