import { type LangfuseColumnDef } from "@/src/components/table/types";
import { Skeleton } from "@/src/components/ui/skeleton";
import { DatasetAggregateTableCell } from "@/src/features/datasets/components/DatasetAggregateTableCell";
import {
  type RunMetrics,
  type RunAggregate,
  type DatasetCompareRunRowData,
} from "@/src/features/datasets/components/DatasetCompareRunsTable";
import { type Row } from "@tanstack/react-table";
import React from "react";

export const constructDatasetRunAggregateColumns = ({
  runAggregateColumnProps,
  projectId,
  scoreKeyToDisplayName,
  cellsLoading = false,
}: {
  runAggregateColumnProps: {
    id: string;
    name: string;
    description?: string;
    createdAt?: Date;
  }[];
  projectId: string;
  scoreKeyToDisplayName: Map<string, string>;
  cellsLoading?: boolean;
}): LangfuseColumnDef<DatasetCompareRunRowData>[] => {
  return runAggregateColumnProps.map((col) => {
    const { id, name, description, createdAt } = col;

    return {
      id,
      accessorKey: id,
      header: name,
      size: 250,
      ...(description && {
        headerTooltip: {
          description,
        },
      }),
      cell: ({ row }: { row: Row<DatasetCompareRunRowData> }) => {
        const runData: RunAggregate = row.getValue("runs") ?? {};

        // if cell is loading or if run created at timestamp is less than 20 seconds ago, show skeleton
        if (
          cellsLoading ||
          (createdAt && createdAt.getTime() + 20000 > Date.now())
        )
          return <Skeleton className="h-full min-h-0 w-full" />;

        if (!Boolean(Object.keys(runData).length)) return null;
        if (!runData.hasOwnProperty(id)) return null;

        const value: RunMetrics | undefined = runData[id];

        if (!value) return null;
        return (
          <DatasetAggregateTableCell
            value={value}
            projectId={projectId}
            scoreKeyToDisplayName={scoreKeyToDisplayName}
          />
        );
      },
    };
  });
};

export const getDatasetRunAggregateColumnProps = (isLoading: boolean) => ({
  accessorKey: "runs",
  header: "Runs",
  id: "runs",
  isPinned: true,
  cell: () => {
    return isLoading ? <Skeleton className="h-3 w-1/2" /> : null;
  },
});
