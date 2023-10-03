import { useState } from "react";
import Header from "@/src/components/layouts/header";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import {
  dateTimeAggregationOptions,
  type DateTimeAggregationOption,
} from "@/src/features/dashboard/lib/timeseries-aggregation";
import { useRouter } from "next/router";
import { TokenChart } from "@/src/features/dashboard/components/TokenChart";
import { LatencyChart } from "@/src/features/dashboard/components/LatencyChart";
import { ChartScores } from "@/src/features/dashboard/components/charts";
import { EventsCard } from "@/src/features/dashboard/components/EventsCard";

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
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="col-span-full">
          <EventsCard
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
        <div className="col-span-full">
          <TokenChart
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
        <div className="col-span-full">
          <LatencyChart
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
        <div className="col-span-full">
          <ChartScores agg={agg} projectId={projectId} />
        </div>
      </div>
    </div>
  );
}
