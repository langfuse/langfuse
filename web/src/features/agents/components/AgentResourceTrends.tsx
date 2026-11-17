import { useMemo } from "react";
import { type AgentOverviewResult } from "@langfuse/shared/agents";
import { SparklineChart } from "@/src/components/design-system/charts/SparklineChart/SparklineChart";
import { type SparklinePlot } from "@/src/components/design-system/charts/SparklineChart/prepareSparkline";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Table } from "@/src/components/design-system/table/Table";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createTableColumn } from "@/src/components/design-system/table/columns/utils/createTableColumn";
import { prepareAgentResourceTrends } from "../lib/agentOverview";

type ResourceTrend = {
  name: string;
  currentCount: number;
  previousCount: number;
  plot: SparklinePlot | null;
};

export function AgentResourceTrends({
  result,
}: {
  result: AgentOverviewResult;
}) {
  const rows = useMemo(() => prepareAgentResourceTrends(result), [result]);
  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      <ResourceTrends
        title="Tools used"
        rows={rows.tools}
        total={result.toolsTotalCount}
      />
      <ResourceTrends
        title="Skills loaded"
        rows={rows.skills}
        total={result.skillsTotalCount}
      />
    </div>
  );
}

function ResourceTrends({
  title,
  rows,
  total,
}: {
  title: string;
  rows: ResourceTrend[];
  total: number;
}) {
  const columns = [
    createTextTableColumn<ResourceTrend>({
      accessorKey: "name",
      header: "Name",
      size: 240,
    }),
    createTableColumn<ResourceTrend, SparklinePlot>({
      accessorKey: "plot",
      header: "Activity",
      size: 160,
      loadingCell: (
        <Skeleton className="h-6 w-full motion-reduce:animate-none" />
      ),
      renderCell: (plot, { row }) =>
        plot ? (
          <SparklineChart
            size="sm"
            plot={plot}
            label={`${row.original.name}: ${row.original.currentCount.toLocaleString()} recorded uses in the selected period`}
          />
        ) : (
          <span className="text-muted-foreground text-xs">Unavailable</span>
        ),
    }),
    createNumberTableColumn<ResourceTrend>({
      accessorKey: "currentCount",
      header: "Selected period",
      size: 130,
      formatter: (value) => value.toLocaleString(),
    }),
    createNumberTableColumn<ResourceTrend>({
      accessorKey: "previousCount",
      header: "Previous period",
      size: 130,
      formatter: (value) => value.toLocaleString(),
    }),
  ];
  return (
    <section className="ph-no-capture min-w-0 overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between gap-2 p-4">
        <h3 className="text-sm font-bold">{title}</h3>
        {rows.length < total && (
          <span className="text-muted-foreground text-xs">
            Top {rows.length} of {total}
          </span>
        )}
      </div>
      <div className="max-h-80 overflow-auto">
        <Table
          tableName={title}
          columns={columns}
          data={{ status: "success", data: rows }}
          rowHeight="s"
          noResultsMessage="No recorded usage in either period"
        />
      </div>
    </section>
  );
}
