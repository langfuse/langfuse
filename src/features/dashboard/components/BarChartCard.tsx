import { DashboardCard } from "@/src/features/dashboard/components/DashboardCard";
import { NoData } from "@/src/features/dashboard/components/NoData";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { numberFormatter } from "@/src/utils/numbers";
import { BarList } from "@tremor/react";

type BarChartDataPoint = {
  name: string;
  value: number;
};

interface BarChartCardProps {
  isLoading: boolean;
  header: {
    metric: string;
    stat: number;
    category: string;
  };
  chart: {
    data: BarChartDataPoint[];
    header: string;
    metric: string;
  };
}

export default function BarChartCard({
  header,
  chart,
  isLoading,
}: BarChartCardProps) {
  const stat = header.stat ? numberFormatter(header.stat) : "0";
  return (
    <DashboardCard
      title={header.category}
      description={null}
      isLoading={isLoading}
    >
      <TotalMetric metric={stat} description={header.metric} />
      {chart.data.length > 0 ? (
        <>
          <BarList
            data={chart.data}
            valueFormatter={(number: number) =>
              Intl.NumberFormat("us").format(number).toString()
            }
            className="mt-2"
            color={"indigo"}
            showAnimation={true}
          />
        </>
      ) : (
        <NoData noDataText="No data" />
      )}
    </DashboardCard>
  );
}
