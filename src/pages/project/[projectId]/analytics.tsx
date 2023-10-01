import Header from "@/src/components/layouts/header";
import { useRouter } from "next/router";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Construction, Loader } from "lucide-react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/src/components/ui/tabs";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/src/components/ui/card";
import { api } from "@/src/utils/api";
import { BaseTimeSeriesChart } from "@/src/features/dashboard/components/BaseTimeSeriesChart";

import { completionTokens } from "@/src/server/api/services/query-builder";
import { type DateTimeAggregationOption } from "@/src/features/dashboard/lib/timeseries-aggregation";
import { useState } from "react";

export default function AnalyticsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  return (
    <div className="md:container">
      <Header title="Analytics" />
      <TokenChart projectId={projectId} />
    </div>
  );
}

const TokenChart = ({ projectId }: { projectId: string }) => {
  const data = api.dashboard.chart.useQuery({
    projectId,
    from: "observations",
    select: [
      { column: "completionTokens", agg: "SUM" },
      { column: "promptTokens", agg: "SUM" },
      { column: "totalTokens", agg: "SUM" },
    ],
    filter: [
      {
        type: "datetime",
        column: "startTime",
        operator: ">=",
        value: new Date("2023-01-01T00:00:00.000Z"),
      },
      {
        type: "datetime",
        column: "startTime",
        operator: "<=",
        value: new Date("2023-12-31T00:00:00.000Z"),
      },
    ],
    groupBy: [{ type: "datetime", column: "startTime", temporalUnit: "day" }],
  });

  const [agg, setAgg] = useState<DateTimeAggregationOption>("7 days");

  const transformedData = data.data?.map((item) => {
    return {
      ts: item.timestamp instanceof Date ? item.timestamp.getTime() : 0,
      values: [
        typeof item.completionTokens === "number"
          ? { label: "Completion Tokens", value: item.completionTokens }
          : { label: "Completion Tokens", value: 0 },
        typeof item.completionTokens === "number"
          ? { label: "Prompt Tokens", value: item.promptTokens }
          : { label: "Prompt Tokens", value: 0 },
        ,
        typeof item.completionTokens === "number"
          ? { label: "Total Tokens", value: item.totalTokens }
          : { label: "Total Tokens", value: 0 },
        ,
      ],
    };
  });

  return (
    <div className="md:container">
      <Header title="Analytics" />
      <Card>
        <CardHeader className="relative">
          <CardTitle>Generations</CardTitle>
          <CardDescription>Count</CardDescription>
          {data.isLoading ? (
            <div className="absolute right-5 top-5 ">
              <Loader className="h-5 w-5 animate-spin" />
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          <BaseTimeSeriesChart agg={agg} data={transformedData ?? []} />
        </CardContent>
      </Card>
    </div>
  );
};
