import { useState } from "react";
import Header from "@/src/components/layouts/header";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import {
  dateTimeAggregationOptions,
  type DateTimeAggregationOption,
} from "@/src/features/dashboard/lib/timeseriesAggregation";
import {
  ChartLlmCalls,
  ChartScores,
  ChartTraces,
} from "@/src/features/dashboard/components/charts";

export default function Start() {
  const [agg, setAgg] = useState<DateTimeAggregationOption>("7 days");

  return (
    <>
      <Header title="Dashboard" />
      <Tabs
        value={agg}
        onValueChange={(value) => setAgg(value as DateTimeAggregationOption)}
        className="mb-4"
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
        <ChartTraces agg={agg} />
        <ChartLlmCalls agg={agg} />
        <div className="col-span-full">
          <ChartScores agg={agg} />
        </div>
      </div>
    </>
  );
}
