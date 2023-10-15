import { DashboardCard } from "@/src/features/dashboard/components/cards/DashboardCard";
import { NoData } from "@/src/features/dashboard/components/NoData";
import { TotalMetric } from "@/src/features/dashboard/components/TotalMetric";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { BarList } from "@tremor/react";

export type BarChartDataPoint = {
  name: string;
  value: number;
};

interface BarChartCardProps {
  children?: React.ReactNode;
  className?: string;
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
  className,
  header,
  chart,
  isLoading,
  children,
}: BarChartCardProps) {
  const stat = header.stat ? compactNumberFormatter(header.stat) : "0";
  return (
    <DashboardCard
      className={className}
      title={header.category}
      description={null}
      isLoading={isLoading}
    >
      <>
        <TotalMetric metric={stat} description={header.metric} />
        {chart.data.length > 0 ? (
          <>
            <BarList
              data={chart.data}
              valueFormatter={(number: number) =>
                Intl.NumberFormat("us").format(number).toString()
              }
              className="mt-6"
              showAnimation={true}
              color={"indigo"}
            />
          </>
        ) : (
          <NoData noDataText="No data" />
        )}
        {children}
      </>
    </DashboardCard>
  );
}
