import { useState } from "react";
import Header from "@/src/components/layouts/header";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import {
  dateTimeAggregationOptions,
  type DateTimeAggregationOption,
} from "@/src/features/dashboard/lib/timeseries-aggregation";
import {
  ChartScores,
  ChartTraces,
  ChartUsage,
} from "@/src/features/dashboard/components/charts";
import { useRouter } from "next/router";

export default function Start() {
  const [agg, setAgg] = useState<DateTimeAggregationOption>("7 days");
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <>
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
        <ChartTraces agg={agg} projectId={projectId} />
        {/* <ChartGenerations agg={agg} projectId={projectId} /> */}
        <ChartUsage agg={agg} projectId={projectId} />
        <div className="col-span-full">
          <ChartScores agg={agg} projectId={projectId} />
        </div>
      </div>
    </>
  );
}
