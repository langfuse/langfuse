import { useState } from "react";
import Header from "@/src/components/layouts/header";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import {
  dateTimeAggregationOptions,
  type DateTimeAggregationOption,
} from "@/src/features/dashboard/lib/timeseries-aggregation";
import { useRouter } from "next/router";
import { LatencyChart } from "@/src/features/dashboard/components/LatencyChart";
import { ChartScores } from "@/src/features/dashboard/components/ChartScores";
import { TracesBarListChart } from "@/src/features/dashboard/components/TracesChart";
import { MetricTable } from "@/src/features/dashboard/components/MetricTable";
import { ScoresTable } from "@/src/features/dashboard/components/ScoresTable";
import { ModelUsageChart } from "@/src/features/dashboard/components/ModelUsageChart";
import { TracesTimeSeriesChart } from "@/src/features/dashboard/components/TracesTimeSeriesChart";
import { UserChart } from "@/src/features/dashboard/components/UserChart";

export default function Start() {
  const [agg, setAgg] = useState<DateTimeAggregationOption>("7 days");
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const convertAggToDateTime = (agg: DateTimeAggregationOption) => {
    const [num, unit] = agg.split(" ");

    if (!num || !unit) throw new Error("Invalid agg");
    const now = new Date();
    switch (unit) {
      case "minutes":
      case "minute":
        return new Date(now.getTime() - parseInt(num) * 60 * 1000);
      case "hours":
      case "hour":
        return new Date(now.getTime() - parseInt(num) * 60 * 60 * 1000);
      case "days":
        return new Date(now.getTime() - parseInt(num) * 24 * 60 * 60 * 1000);
      case "weeks":
        return new Date(
          now.getTime() - parseInt(num) * 7 * 24 * 60 * 60 * 1000,
        );
      case "months":
      case "month":
        return new Date(
          now.getTime() - parseInt(num) * 30 * 24 * 60 * 60 * 1000,
        );
      case "year":
      case "years":
        return new Date(
          now.getTime() - parseInt(num) * 365 * 24 * 60 * 60 * 1000,
        );
    }
    throw new Error("Invalid agg");
  };

  return (
    <div className="md:container">
      <Header title="Dashboard" />
      <Tabs
        value={agg}
        onValueChange={(value) => setAgg(value as DateTimeAggregationOption)}
        className="mb-4 max-w-full overflow-x-auto"
      >
        <TabsList>
          {dateTimeAggregationOptions.map((option) => (
            <TabsTrigger key={option} value={option}>
              {option}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-6">
        <TracesBarListChart
          className="col-span-1 xl:col-span-2 "
          projectId={projectId}
          globalFilterState={[
            {
              column: "startTime",
              operator: ">",
              type: "datetime",
              value: convertAggToDateTime(agg),
            },
            {
              column: "startTime",
              operator: "<",
              type: "datetime",
              value: new Date(),
            },
          ]}
        />
        <MetricTable
          className="col-span-1 xl:col-span-2"
          projectId={projectId}
          globalFilterState={[
            {
              column: "startTime",
              operator: ">",
              type: "datetime",
              value: convertAggToDateTime(agg),
            },
            {
              column: "startTime",
              operator: "<",
              type: "datetime",
              value: new Date(),
            },
          ]}
        />
        <ScoresTable
          className="col-span-1 xl:col-span-2"
          projectId={projectId}
          globalFilterState={[
            {
              column: "startTime",
              operator: ">",
              type: "datetime",
              value: convertAggToDateTime(agg),
            },
            {
              column: "startTime",
              operator: "<",
              type: "datetime",
              value: new Date(),
            },
          ]}
        />
        <TracesTimeSeriesChart
          className="col-span-1 xl:col-span-3"
          projectId={projectId}
          globalFilterState={[
            {
              column: "startTime",
              operator: ">",
              type: "datetime",
              value: convertAggToDateTime(agg),
            },
            {
              column: "startTime",
              operator: "<",
              type: "datetime",
              value: new Date(),
            },
          ]}
          agg={agg}
        />
        <ModelUsageChart
          className="min-h-24  col-span-1 xl:col-span-3"
          projectId={projectId}
          globalFilterState={[
            {
              column: "startTime",
              operator: ">",
              type: "datetime",
              value: convertAggToDateTime(agg),
            },
            {
              column: "startTime",
              operator: "<",
              type: "datetime",
              value: new Date(),
            },
          ]}
          agg={agg}
        />
        <UserChart
          className="col-span-1 xl:col-span-3"
          projectId={projectId}
          globalFilterState={[
            {
              column: "startTime",
              operator: ">",
              type: "datetime",
              value: convertAggToDateTime(agg),
            },
            {
              column: "startTime",
              operator: "<",
              type: "datetime",
              value: new Date(),
            },
          ]}
          agg={agg}
        />
        <ChartScores
          className="col-span-1 xl:col-span-3"
          agg={agg}
          projectId={projectId}
        />
        <LatencyChart
          className="col-span-1 flex-auto justify-between xl:col-span-full"
          projectId={projectId}
          agg={agg}
          globalFilterState={[
            {
              column: "startTime",
              operator: ">",
              type: "datetime",
              value: convertAggToDateTime(agg),
            },
            {
              column: "startTime",
              operator: "<",
              type: "datetime",
              value: new Date(),
            },
          ]}
        />
      </div>
    </div>
  );
}
