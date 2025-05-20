import React from "react";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";
import { DashboardTable } from "@/src/features/dashboard/components/cards/DashboardTable";

interface TableChartProps {
  data: DataPoint[];
}

const TableChart: React.FC<TableChartProps> = ({ data }) => {
  // Convert DataPoint[] to headers and rows for DashboardTable
  // Assuming DataPoint has name and value properties
  const headers = ["Category", "Value"];
  const rows = data.map((point) => [
    <span key={`name-${point.dimension}`} className="font-medium text-primary">
      {point.dimension}
    </span>,
    <span key={`value-${point.dimension}`}>
      {point.metric.toLocaleString()}
    </span>,
  ]);

  return (
    <div className="flex h-[500px] flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <DashboardTable headers={headers} rows={rows} isLoading={false} />
      </div>
    </div>
  );
};

export default TableChart;
