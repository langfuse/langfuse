import { useRouter } from "next/router";
import { GenerationLatencyChart } from "@/src/features/dashboard/components/LatencyChart";
import { ChartScores } from "@/src/features/dashboard/components/ChartScores";
import { TracesBarListChart } from "@/src/features/dashboard/components/TracesBarListChart";
import { ModelCostTable } from "@/src/features/dashboard/components/ModelCostTable";
import { ScoresTable } from "@/src/features/dashboard/components/ScoresTable";
import { ModelUsageChart } from "@/src/features/dashboard/components/ModelUsageChart";
import { TracesAndObservationsTimeSeriesChart } from "@/src/features/dashboard/components/TracesTimeSeriesChart";
import { UserChart } from "@/src/features/dashboard/components/UserChart";
import { DatePickerWithRange } from "@/src/components/date-picker";
import { api } from "@/src/utils/api";
import { FeedbackButtonWrapper } from "@/src/features/feedback/component/FeedbackButton";
import { BarChart2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { PopoverFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { type FilterState } from "@langfuse/shared";
import { type ColumnDefinition } from "@langfuse/shared";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { LatencyTables } from "@/src/features/dashboard/components/LatencyTables";
import { useMemo } from "react";
import { findClosestDashboardInterval } from "@/src/utils/date-range-utils";
import { useDashboardDateRange } from "@/src/hooks/useDashboardDateRange";
import { useDebounce } from "@/src/hooks/useDebounce";
import { ScoreAnalytics } from "@/src/features/dashboard/components/score-analytics/ScoreAnalytics";
import SetupTracingButton from "@/src/features/setup/components/SetupTracingButton";
import { useUiCustomization } from "@/src/ee/features/ui-customization/useUiCustomization";
import { useEntitlementLimit } from "@/src/features/entitlements/hooks";
import Page from "@/src/components/layouts/page";
import { MultiSelect } from "@/src/features/filters/components/multi-select";
import {
  convertSelectedEnvironmentsToFilter,
  useEnvironmentFilter,
} from "@/src/hooks/use-environment-filter";

export default function Dashboard() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const { selectedOption, dateRange, setDateRangeAndOption } =
    useDashboardDateRange();

  const uiCustomization = useUiCustomization();

  const lookbackLimit = useEntitlementLimit("data-access-days");

  const [userFilterState, setUserFilterState] = useQueryFilterState(
    [],
    "dashboard",
    projectId,
  );

  const traceFilterOptions = api.traces.filterOptions.useQuery(
    {
      projectId,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  const environmentFilterOptions =
    api.projects.environmentFilterOptions.useQuery(
      { projectId },
      {
        trpc: {
          context: {
            skipBatch: true,
          },
        },
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: Infinity,
      },
    );
  const environmentOptions: string[] =
    environmentFilterOptions.data?.map((value) => value.environment) || [];

  // Add effect to update filter state when environments change
  const { selectedEnvironments, setSelectedEnvironments } =
    useEnvironmentFilter(environmentOptions, projectId);

  const nameOptions = traceFilterOptions.data?.name || [];
  const tagsOptions = traceFilterOptions.data?.tags || [];

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

  const agg = useMemo(
    () =>
      dateRange
        ? (findClosestDashboardInterval(dateRange) ?? "7 days")
        : "7 days",
    [dateRange],
  );

  const fromTimestamp = dateRange
    ? dateRange.from
    : new Date(new Date().getTime() - 1000);
  const toTimestamp = dateRange ? dateRange.to : new Date();
  const timeFilter = [
    {
      type: "datetime" as const,
      column: "startTime",
      operator: ">" as const,
      value: fromTimestamp,
    },
    {
      type: "datetime" as const,
      column: "startTime",
      operator: "<" as const,
      value: toTimestamp,
    },
  ];

  const environmentFilter = convertSelectedEnvironmentsToFilter(
    ["environment"],
    selectedEnvironments,
  );

  const mergedFilterState: FilterState = [
    ...userFilterState,
    ...timeFilter,
    ...environmentFilter,
  ];

  return (
    <Page
      withPadding
      scrollable
      headerProps={{
        title: "Home",
        actionButtonsRight: <SetupTracingButton />,
      }}
    >
      <div className="my-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-2 lg:flex-row lg:gap-3">
          <DatePickerWithRange
            dateRange={dateRange}
            setDateRangeAndOption={useDebounce(setDateRangeAndOption)}
            selectedOption={selectedOption}
            className="my-0 max-w-full overflow-x-auto"
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
        </div>
        {uiCustomization?.feedbackHref === undefined && (
          <FeedbackButtonWrapper
            title="Request Chart"
            description="Your feedback matters! Let the Langfuse team know what additional data or metrics you'd like to see in your dashboard."
            className="hidden lg:flex"
          >
            <Button
              id="date"
              variant={"outline"}
              className={
                "group justify-start gap-x-3 text-left font-semibold text-primary hover:bg-primary-foreground hover:text-primary-accent"
              }
            >
              <BarChart2
                className="hidden h-6 w-6 shrink-0 text-primary group-hover:text-primary-accent lg:block"
                aria-hidden="true"
              />
              Request Chart
            </Button>
          </FeedbackButtonWrapper>
        )}
      </div>
      <div className="grid w-full grid-cols-1 gap-3 overflow-hidden lg:grid-cols-2 xl:grid-cols-6">
        <TracesBarListChart
          className="col-span-1 xl:col-span-2"
          projectId={projectId}
          globalFilterState={[...userFilterState, ...environmentFilter]}
          fromTimestamp={fromTimestamp}
          toTimestamp={toTimestamp}
          isLoading={environmentFilterOptions.isLoading}
        />
        <ModelCostTable
          className="col-span-1 xl:col-span-2"
          projectId={projectId}
          globalFilterState={[...userFilterState, ...environmentFilter]}
          fromTimestamp={fromTimestamp}
          toTimestamp={toTimestamp}
          isLoading={environmentFilterOptions.isLoading}
        />
        <ScoresTable
          className="col-span-1 xl:col-span-2"
          projectId={projectId}
          globalFilterState={mergedFilterState}
          isLoading={environmentFilterOptions.isLoading}
        />
        <TracesAndObservationsTimeSeriesChart
          className="col-span-1 xl:col-span-3"
          projectId={projectId}
          globalFilterState={[...userFilterState, ...environmentFilter]}
          fromTimestamp={fromTimestamp}
          toTimestamp={toTimestamp}
          agg={agg}
          isLoading={environmentFilterOptions.isLoading}
        />
        <ModelUsageChart
          className="col-span-1 min-h-24 xl:col-span-3"
          projectId={projectId}
          globalFilterState={mergedFilterState}
          fromTimestamp={fromTimestamp}
          toTimestamp={toTimestamp}
          userAndEnvFilterState={[...userFilterState, ...environmentFilter]}
          agg={agg}
          isLoading={environmentFilterOptions.isLoading}
        />
        <UserChart
          className="col-span-1 xl:col-span-3"
          projectId={projectId}
          globalFilterState={[...userFilterState, ...environmentFilter]}
          fromTimestamp={fromTimestamp}
          toTimestamp={toTimestamp}
          isLoading={environmentFilterOptions.isLoading}
        />
        <ChartScores
          className="col-span-1 xl:col-span-3"
          agg={agg}
          projectId={projectId}
          globalFilterState={[...userFilterState, ...environmentFilter]}
          fromTimestamp={fromTimestamp}
          toTimestamp={toTimestamp}
          isLoading={environmentFilterOptions.isLoading}
        />
        <LatencyTables
          projectId={projectId}
          globalFilterState={[...userFilterState, ...environmentFilter]}
          fromTimestamp={fromTimestamp}
          toTimestamp={toTimestamp}
          isLoading={environmentFilterOptions.isLoading}
        />
        <GenerationLatencyChart
          className="col-span-1 flex-auto justify-between lg:col-span-full"
          projectId={projectId}
          agg={agg}
          globalFilterState={[...userFilterState, ...environmentFilter]}
          fromTimestamp={fromTimestamp}
          toTimestamp={toTimestamp}
          isLoading={environmentFilterOptions.isLoading}
        />
        <ScoreAnalytics
          className="col-span-1 flex-auto justify-between lg:col-span-full"
          agg={agg}
          projectId={projectId}
          globalFilterState={[...userFilterState, ...environmentFilter]}
          fromTimestamp={fromTimestamp}
          toTimestamp={toTimestamp}
          isLoading={environmentFilterOptions.isLoading}
        />
      </div>
    </Page>
  );
}
