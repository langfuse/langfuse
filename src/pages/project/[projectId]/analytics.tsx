import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import {
  type AvailableDateRangeSelections,
  DatePickerWithRange,
  DEFAULT_DATE_RANGE_SELECTION,
} from "@/src/components/date-picker";
import {
  NumberParam,
  StringParam,
  useQueryParams,
  withDefault,
} from "use-query-params";
import { addDays } from "date-fns";
import { useState } from "react";
import type { DateTimeAggregationOption } from "@/src/features/dashboard/lib/timeseries-aggregation";
import { type DashboardDateRange } from "@/src/pages/project/[projectId]/index";
import { isValidOption } from "@/src/utils/types";
import { SchoolUsageChart } from "@/src/features/key_analytics/components/SchoolUsageChart";
import { PhaseCategoryUsageChart } from "@/src/features/key_analytics/components/PhaseCategoryUsageChart";
import { PopularUserRolesChart } from "@/src/features/key_analytics/components/RoleUsageChart";
import { type FilterState } from "@/src/features/filters/types";
import { FeatureUsageChart } from "@/src/features/key_analytics/components/FeatureUsageChart";
import { FeatureUsageTimeSeriesChart } from "@/src/features/key_analytics/components/FeatureUsageTimeSeriesChart";
import { FeatureCostMetrics } from "@/src/features/key_analytics/components/FeatureCostChart";
import {
  OrganizationCostChart,
} from '@/src/features/key_analytics/components/SchoolCostChart';

export default function Analytics() {
  const [agg, setAgg] = useState<DateTimeAggregationOption>("7 days");

  const router = useRouter();
  const projectId = router.query.projectId as string;

  const currDate = new Date();

  const FromParam = withDefault(NumberParam, addDays(currDate, -30).getTime());
  const ToParam = withDefault(NumberParam, currDate.getTime());
  const SelectParam = withDefault(StringParam, "Select a date range");

  const [urlParams, setUrlParams] = useQueryParams({
    from: FromParam,
    to: ToParam,
    select: SelectParam,
  });

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
    setUrlParams({
      select: option ? option.toString() : urlParams.select,
      from: dateRange ? dateRange.from?.getTime() : urlParams.from,
      to: dateRange ? dateRange.to?.getTime() : urlParams.to,
    });
  };

  const globalFilterState = [
    {
      type: "datetime",
      value: agg,
    },
  ];

  return (
    <div className="xl:container">
      <Header
        title="Overall Analytics"
        help={{
          description:
            "A session is a collection of related traces, such as a conversation or thread. To begin, add a sessionId to the trace.",
          href: "https://langfuse.com/docs/sessions",
        }}
      />
      <div>
        <DatePickerWithRange
          dateRange={dateRange}
          setAgg={setAgg}
          setDateRangeAndOption={setDateRangeAndOption}
          selectedOption={selectedOption}
          className="max-w-full overflow-x-auto"
        />
        <h1 className="mt-8 text-3xl font-semibold">Usage</h1>
        <div className="mt-8 flex w-full flex-grow gap-4">
          <FeatureUsageTimeSeriesChart
            className="w-full"
            projectId={projectId}
            globalFilterState={globalFilterState as FilterState}
            agg={agg}
          />
          <FeatureUsageChart
            className="w-full"
            projectId={projectId}
            globalFilterState={globalFilterState as FilterState}
          />
        </div>

        <div className="mt-8 flex w-full flex-grow gap-4">
          <SchoolUsageChart
            className="w-full"
            projectId={projectId}
            globalFilterState={globalFilterState as FilterState}
          />
        </div>
        <div className="mt-8 flex w-full flex-grow gap-4">
          <PopularUserRolesChart
            className="w-full"
            projectId={projectId}
            globalFilterState={globalFilterState as FilterState}
          />
        </div>
        <div className="mt-8 flex w-full flex-grow gap-4">
          <PhaseCategoryUsageChart
            className="w-full"
            projectId={projectId}
            globalFilterState={globalFilterState as FilterState}
          />
        </div>
        <h1 className="mt-8 text-3xl font-semibold">Costs</h1>
        <div className="mt-8 flex w-full flex-grow gap-4">
          <FeatureCostMetrics
            className="w-full"
            projectId={projectId}
            globalFilterState={globalFilterState as FilterState}
          />
          <OrganizationCostChart
            className="w-full"
            projectId={projectId}
            globalFilterState={globalFilterState as FilterState}
          />
        </div>
      </div>
    </div>
  );
}
