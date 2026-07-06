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
import { useCallback, useMemo } from "react";
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
import { DashboardGrid } from "@/src/features/widgets/components/DashboardGrid";

export default function Dashboard() {
  const router = useRouter();
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

  const gridFilterState: FilterState = useMemo(
    () => [...userFilterState, ...environmentFilter],
    [userFilterState, environmentFilter],
  );
  const isDashboardDataReady = environmentOptionsState.isReady;

  // Home renders the Langfuse-curated Home dashboard (upserted by the worker
  // at startup). Fall back to the shared constant so Home still renders when
  // the row does not exist yet (e.g. worker has not run against this DB).
  const homeDashboard = api.dashboard.getDashboard.useQuery(
    { projectId, dashboardId: LANGFUSE_HOME_DASHBOARD_ID },
    { enabled: Boolean(projectId), retry: false },
  );
  const definition =
    homeDashboard.data?.definition ?? LANGFUSE_HOME_DASHBOARD_DEFINITION;

  const getWidgetSchedulerId = useCallback(
    (widgetPlacementId: string) => `${projectId}:${widgetPlacementId}`,
    [projectId],
  );

  const schedulerResetKey = useMemo(() => {
    return [
      projectId,
      metricsVersion,
      absoluteTimeRange?.from?.toISOString() ?? "",
      absoluteTimeRange?.to?.toISOString() ?? "",
      JSON.stringify(userFilterState),
      selectedEnvironments.join(","),
    ].join("|");
  }, [
    absoluteTimeRange?.from,
    absoluteTimeRange?.to,
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
              />
            </>
          ),
          actionButtonsRight: (
            <>
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
        {!isDashboardDataReady ? (
          <NoDataOrLoading isLoading />
        ) : (
          <DashboardGrid
            widgets={definition.widgets}
            onChange={() => undefined}
            canEdit={false}
            dashboardId={LANGFUSE_HOME_DASHBOARD_ID}
            projectId={projectId}
            dateRange={absoluteTimeRange}
            filterState={gridFilterState}
            onDeleteWidget={() => undefined}
            dashboardOwner="LANGFUSE"
            getWidgetSchedulerId={getWidgetSchedulerId}
          />
        )}
      </Page>
    </DashboardQuerySchedulerProvider>
  );
}
