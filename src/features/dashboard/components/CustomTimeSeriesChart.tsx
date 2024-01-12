import { type TimeSeriesChartDataPoint } from "@/src/features/dashboard/components/BaseTimeSeriesChart";
import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { api } from "@/src/utils/api";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { type Chart } from "@prisma/client";
import { AreaChart } from "@tremor/react";

export const CustomTimeSeriesChart = ({
  className,
  projectId,
  chartConfig,
}: {
  className?: string;
  projectId: string;
  chartConfig: Chart;
}) => {
  const dataPoints = api.dashboard.executeQuery.useQuery({
    projectId,
    chartId: chartConfig.id,
  });

  const transformedData: TimeSeriesChartDataPoint[] = dataPoints.data
    ? dataPoints.data.map((item) => {
        return {
          ts: item[0] as number,
          values: [
            {
              label: "Value",
              value: item[1] as number,
            },
          ],
        };
      })
    : [];

  return (
    <DashboardCard
      className={className}
      title={chartConfig.name}
      isLoading={dataPoints.isLoading}
      cardContentClassName="flex flex-col content-end "
    >
      <AreaChart
        className="mt-4 h-full min-h-80 self-stretch"
        data={transformedData}
        index="timestamp"
        categories={["Value"]}
        connectNulls={true}
        colors={["indigo", "cyan", "zinc", "purple"]}
        valueFormatter={compactNumberFormatter}
        noDataText="No data"
        showLegend={false}
        showAnimation={true}
      />
    </DashboardCard>
  );
};
