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
import { usePostHog } from "posthog-js/react";
import { FeedbackButtonWrapper } from "@/src/features/feedback/component/FeedbackButton";
import { BarChart2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { FilterBuilder } from "@/src/features/filters/components/filter-builder";
import { type FilterState } from "@/src/features/filters/types";
import { type ColumnDefinition } from "@/src/server/api/interfaces/tableDefinition";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { LatencyTables } from "@/src/features/dashboard/components/LatencyTables";
import { useMemo } from "react";
import { useSession } from "next-auth/react";

export type DashboardDateRange = {
  from: Date;
  to: Date;
};

export default function Start() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const posthog = usePostHog();

  const session = useSession();
  const project = session.data?.user?.projects.find(
    (project) => project.id === projectId,
  );

  const memoizedDate = useMemo(() => new Date(), []);

  const [urlParams, setUrlParams] = useQueryParams({
    from: withDefault(NumberParam, addDays(memoizedDate, -7).getTime()),
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
    posthog.capture("dashboard:date_range_changed");
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
  const values = traceFilterOptions.data?.name || [];

  const traceName: ColumnDefinition[] = [
    {
      name: "traceName",
      id: "traceName",
      type: "stringOptions" as const,
      options: values,
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
          <FilterBuilder
            columns={traceName}
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
              "group justify-start gap-x-3 text-left font-semibold text-gray-700 hover:bg-gray-50 hover:text-indigo-600"
            }
          >
            <BarChart2
              className="hidden h-6 w-6 shrink-0 text-gray-700 group-hover:text-indigo-600 lg:block"
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
        <MetricTable
          className="col-span-1 xl:col-span-2"
          projectId={projectId}
          globalFilterState={mergedFilterState}
        />
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
        <ModelUsageChart
          className="col-span-1  min-h-24 xl:col-span-3"
          projectId={projectId}
          globalFilterState={mergedFilterState}
          agg={agg}
        />
        <UserChart
          className="col-span-1 xl:col-span-3"
          projectId={projectId}
          globalFilterState={mergedFilterState}
          agg={agg}
        />
        <ChartScores
          className="col-span-1 xl:col-span-3"
          agg={agg}
          projectId={projectId}
          globalFilterState={mergedFilterState}
        />
        <LatencyTables
          projectId={projectId}
          globalFilterState={mergedFilterState}
        />
        <GenerationLatencyChart
          className="col-span-1 flex-auto justify-between lg:col-span-full"
          projectId={projectId}
          agg={agg}
          globalFilterState={mergedFilterState}
        />
      </div>
    </div>
  );
}
