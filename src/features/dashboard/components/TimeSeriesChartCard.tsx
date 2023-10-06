import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/src/components/ui/card";
import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import { type DateTimeAggregationOption } from "@/src/features/dashboard/lib/timeseries-aggregation";
import { Loader } from "lucide-react";
import {} from "@/src/features/dashboard/components/hooks";

export type TimeSeriesChartDataPoint = {
  ts: number;
  values: { label: string; value?: number }[];
};

interface TimeSeriesChartCardProps {
  title: string;
  metric: string;
  isLoading: boolean;
  data?: TimeSeriesChartDataPoint[];
  agg: DateTimeAggregationOption;
  connectNulls: boolean;
}

export const TimeSeriesChartCard = ({
  title,
  metric,
  isLoading,
  data,
  agg,
  connectNulls,
}: TimeSeriesChartCardProps) => {
  return (
    <Card className="relative">
      <CardHeader className="relative">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{metric}</CardDescription>
        {isLoading ? (
          <div className="absolute right-5 top-5 ">
            <Loader className="h-5 w-5 animate-spin" />
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        <BaseTimeSeriesChart
          agg={agg}
          data={data ?? []}
          connectNulls={connectNulls}
        />
      </CardContent>
    </Card>
  );
};
