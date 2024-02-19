import { useState } from "react";
import Header from "@/src/components/layouts/header";
import { type DateTimeAggregationOption } from "@/src/features/dashboard/lib/timeseries-aggregation";
import { useRouter } from "next/router";
import { LatencyChart } from "@/src/features/dashboard/components/LatencyChart";
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

export type DashboardDateRange = {
  from: Date;
  to: Date;
};

export default function Start() {
  const [agg, setAgg] = useState<DateTimeAggregationOption>("7 days");
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const posthog = usePostHog();

  const projects = api.projects.all.useQuery();
  const project = projects.data?.find((p) => p.id === projectId);

  const currDate = new Date();
  const FromParam = withDefault(NumberParam, addDays(currDate, -7).getTime());
  const ToParam = withDefault(NumberParam, currDate.getTime());
  const SelectParam = withDefault(StringParam, "Select a date range");

  const [urlParams, setUrlParams] = useQueryParams({
    from: FromParam,
    to: ToParam,
    select: SelectParam,
  });
  const [traceNameFilter, setTraceNameFilter] = useState<FilterState>([]);

  const dateRange =
    urlParams.from && urlParams.to
      ? { from: new Date(urlParams.from), to: new Date(urlParams.to) }
      : undefined;

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

  // To Do: trace names fetch route
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
      type: "stringOptions" as const,
      options: values,
      internal: "internalValue",
    },
  ];

  const globalFilterState = dateRange
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

  const wipGlobalFilterState = dateRange
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
        ...traceNameFilter,
      ]
    : [];

  return (
    <div className="md:container">
      <Header title={project?.name ?? "Dashboard"} />
      <div className="flex flex-wrap items-center justify-between">
        <DatePickerWithRange
          dateRange={dateRange}
          setAgg={setAgg}
          setDateRangeAndOption={setDateRangeAndOption}
          selectedOption={selectedOption}
          className="max-w-full overflow-x-auto"
        />
        <FeedbackButtonWrapper
          title="Request Chart"
          description="Your feedback matters! Let the Langfuse team know what additional data or metrics you'd like to see in your dashboard."
          type="dashboard"
          className="hidden md:flex"
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
          className="col-span-1 xl:col-span-2 "
          projectId={projectId}
          globalFilterState={wipGlobalFilterState}
        />

        <MetricTable
          className="col-span-1 xl:col-span-2"
          projectId={projectId}
          globalFilterState={globalFilterState}
        />
        <ScoresTable
          className="col-span-1 xl:col-span-2"
          projectId={projectId}
          globalFilterState={globalFilterState}
        />
        <TracesTimeSeriesChart
          className="col-span-1 xl:col-span-3"
          projectId={projectId}
          globalFilterState={globalFilterState}
          agg={agg}
        />
        <ModelUsageChart
          className="col-span-1  min-h-24 xl:col-span-3"
          projectId={projectId}
          globalFilterState={globalFilterState}
          agg={agg}
        />
        <UserChart
          className="col-span-1 xl:col-span-3"
          projectId={projectId}
          globalFilterState={globalFilterState}
          agg={agg}
        />
        <ChartScores
          className="col-span-1 xl:col-span-3"
          agg={agg}
          projectId={projectId}
          globalFilterState={globalFilterState}
        />
        <LatencyChart
          className="col-span-1 flex-auto justify-between xl:col-span-full"
          projectId={projectId}
          agg={agg}
          globalFilterState={globalFilterState}
        />
      </div>
    </div>
  );
}
