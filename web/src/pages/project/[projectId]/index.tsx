import Header from "@/src/components/layouts/header";
import { findClosestInterval } from "@/src/features/dashboard/lib/timeseries-aggregation";
import { useRouter } from "next/router";
import { GenerationLatencyChart } from "@/src/features/dashboard/components/LatencyChart";
import { ChartScores } from "@/src/features/dashboard/components/ChartScores";
import { TracesBarListChart } from "@/src/features/dashboard/components/TracesBarListChart";
import { MetricTable } from "@/src/features/dashboard/components/MetricTable";
import { ScoresTable } from "@/src/features/dashboard/components/ScoresTable";
import { ModelUsageChart } from "@/src/features/dashboard/components/ModelUsageChart";
import { TracesTimeSeriesChart } from "@/src/features/dashboard/components/TracesTimeSeriesChart";
import { UserChart } from "@/src/features/dashboard/components/UserChart";
import {
  type AvailableDateRangeSelections,
  DEFAULT_DATE_RANGE_SELECTION,
  DatePickerWithRange,
} from "@/src/components/date-picker";
import { addDays } from "date-fns";
import {
  NumberParam,
  StringParam,
  useQueryParams,
  withDefault,
} from "use-query-params";
import { isValidOption } from "@/src/utils/types";
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
import { useSession } from "next-auth/react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useLookBackDays } from "@/src/hooks/useLookBackDays";

export type DashboardDateRange = {
  from: Date;
  to: Date;
};

export default function Start() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const capture = usePostHogClientCapture();

  const session = useSession();
  const disableExpensiveDashboardComponents =
    session.data?.environment.disableExpensivePostgresQueries ?? true;

  const project = session.data?.user?.projects.find(
    (project) => project.id === projectId,
  );

  const memoizedDate = useMemo(() => new Date(), []);

  const [urlParams, setUrlParams] = useQueryParams({
    from: withDefault(
      NumberParam,
      addDays(memoizedDate, -useLookBackDays(projectId)).getTime(),
    ),
    to: withDefault(NumberParam, memoizedDate.getTime()),
    select: withDefault(StringParam, "Select a date range"),
  });

  const dateRange = useMemo(
    () =>
      urlParams.from && urlParams.to
        ? { from: new Date(urlParams.from), to: new Date(urlParams.to) }
        : undefined,
    [urlParams.from, urlParams.to],
  );

  const selectedOption = isValidOption(urlParams.select)
    ? urlParams.select
    : DEFAULT_DATE_RANGE_SELECTION;

  const setDateRangeAndOption = (
    option?: AvailableDateRangeSelections,
    dateRange?: DashboardDateRange,
  ) => {
    capture("dashboard:date_range_changed");
    setUrlParams({
      select: option ? option.toString() : urlParams.select,
      from: dateRange ? dateRange.from.getTime() : urlParams.from,
      to: dateRange ? dateRange.to.getTime() : urlParams.to,
    });
  };

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
    },
  );
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
  ];

  const [userFilterState, setUserFilterState] = useQueryFilterState(
    [],
    "dashboard",
  );

  const agg = useMemo(
    () => (dateRange ? findClosestInterval(dateRange) ?? "7 days" : "7 days"),
    [dateRange],
  );

  const timeFilter = dateRange
    ? [
        {
          type: "datetime" as const,
          column: "startTime",
          operator: ">" as const,
          value: dateRange.from,
        },
        {
          type: "datetime" as const,
          column: "startTime",
          operator: "<" as const,
          value: dateRange.to,
        },
      ]
    : [];

  const mergedFilterState: FilterState = [...userFilterState, ...timeFilter];

  return (
    <div className="md:container">
      <Header title={project?.name ?? "Dashboard"} />
      <div className="my-3 flex flex-wrap items-center justify-between gap-2">
        <div className=" flex flex-col gap-2 lg:flex-row">
          <DatePickerWithRange
            dateRange={dateRange}
            setDateRangeAndOption={setDateRangeAndOption}
            selectedOption={selectedOption}
            className="my-0 max-w-full overflow-x-auto"
          />
          <PopoverFilterBuilder
            columns={filterColumns}
            filterState={userFilterState}
            onChange={setUserFilterState}
          />
        </div>
        <FeedbackButtonWrapper
          title="Request Chart"
          description="Your feedback matters! Let the Langfuse team know what additional data or metrics you'd like to see in your dashboard."
          type="dashboard"
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
      </div>
      <div className="grid w-full grid-cols-1 gap-4 overflow-hidden lg:grid-cols-2 xl:grid-cols-6">
        <TracesBarListChart
          className="col-span-1 xl:col-span-2"
          projectId={projectId}
          globalFilterState={mergedFilterState}
        />
        {!disableExpensiveDashboardComponents && (
          <MetricTable
            className="col-span-1 xl:col-span-2"
            projectId={projectId}
            globalFilterState={mergedFilterState}
          />
        )}
        <ScoresTable
          className="col-span-1 xl:col-span-2"
          projectId={projectId}
          globalFilterState={mergedFilterState}
        />
        <TracesTimeSeriesChart
          className="col-span-1 xl:col-span-3"
          projectId={projectId}
          globalFilterState={mergedFilterState}
          agg={agg}
        />
        {!disableExpensiveDashboardComponents && (
          <ModelUsageChart
            className="col-span-1  min-h-24 xl:col-span-3"
            projectId={projectId}
            globalFilterState={mergedFilterState}
            agg={agg}
          />
        )}
        {!disableExpensiveDashboardComponents && (
          <UserChart
            className="col-span-1 xl:col-span-3"
            projectId={projectId}
            globalFilterState={mergedFilterState}
            agg={agg}
          />
        )}
        <ChartScores
          className="col-span-1 xl:col-span-3"
          agg={agg}
          projectId={projectId}
          globalFilterState={mergedFilterState}
        />
        {!disableExpensiveDashboardComponents && (
          <LatencyTables
            projectId={projectId}
            globalFilterState={mergedFilterState}
          />
        )}
        {!disableExpensiveDashboardComponents && (
          <GenerationLatencyChart
            className="col-span-1 flex-auto justify-between lg:col-span-full"
            projectId={projectId}
            agg={agg}
            globalFilterState={mergedFilterState}
          />
        )}
      </div>
    </div>
  );
}
