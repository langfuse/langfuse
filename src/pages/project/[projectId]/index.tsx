import { useState } from "react";
import Header from "@/src/components/layouts/header";
import { type DateTimeAggregationOption } from "@/src/features/dashboard/lib/timeseries-aggregation";
import { useRouter } from "next/router";
import { LatencyChart } from "@/src/features/dashboard/components/LatencyChart";
import { ChartScores } from "@/src/features/dashboard/components/ChartScores";
import { TracesBarListChart } from "@/src/features/dashboard/components/TracesChart";
import { MetricTable } from "@/src/features/dashboard/components/MetricTable";
import { ScoresTable } from "@/src/features/dashboard/components/ScoresTable";
import { ModelUsageChart } from "@/src/features/dashboard/components/ModelUsageChart";
import { TracesTimeSeriesChart } from "@/src/features/dashboard/components/TracesTimeSeriesChart";
import { UserChart } from "@/src/features/dashboard/components/UserChart";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";
import { env } from "@/src/env.mjs";
import { DatePickerWithRange } from "@/src/components/date-picker";
import { type DateRange } from "react-day-picker";
import { addDays } from "date-fns";

export default function Start() {
  const [agg, setAgg] = useState<DateTimeAggregationOption>("7 days");
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: addDays(new Date(), -30),
    to: new Date(),
  });

  const globalFilterState =
    dateRange && dateRange.from && dateRange.to
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

  return (
    <div className="md:container">
      <Header
        title="Dashboard"
        actionButtons={
          env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined ? (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/project/${projectId}/analytics`}>
                Analytics (alpha) ↗
              </Link>
            </Button>
          ) : null
        }
      />
      <DatePickerWithRange
        dateRange={dateRange}
        setDateRange={setDateRange}
        setAgg={setAgg}
        className=" max-w-full overflow-x-auto"
      />
      <div className="grid w-full grid-cols-1 gap-4 overflow-hidden lg:grid-cols-2 xl:grid-cols-6">
        <TracesBarListChart
          className="col-span-1 xl:col-span-2 "
          projectId={projectId}
          globalFilterState={globalFilterState}
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
          className="min-h-24  col-span-1 xl:col-span-3"
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
