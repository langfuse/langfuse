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

type RunAggregateColumnProps = {
  id: string;
  name: string;
};

export const constructDatasetRunAggregateColumns = ({
  runAggregateColumnProps,
  cellsLoading = false,
  projectId,
}: {
  runAggregateColumnProps: RunAggregateColumnProps[];
  cellsLoading?: boolean;
  projectId: string;
}): LangfuseColumnDef<DatasetCompareRunRowData>[] => {
  return runAggregateColumnProps.map((col) => {
    const { id, name } = col;

    return {
      id,
      accessorKey: id,
      header: name,
      size: 150,
      enableHiding: true,
      cell: ({ row }: { row: Row<DatasetCompareRunRowData> }) => {
        const runData: RunAggregate = row.getValue("runs") ?? {};

        if (cellsLoading) return <Skeleton className="h-3 w-1/2" />;

        if (!Boolean(Object.keys(runData).length)) return null;
        if (!runData.hasOwnProperty(id)) return null;

        const value: RunMetrics | undefined = runData[id];

        if (!value) return null;
        return (
          <DatasetAggregateTableCell value={value} projectId={projectId} />
        );
      },
    };
  });
};

export const getDatasetRunAggregateColumnProps = (isLoading: boolean) => ({
  accessorKey: "runs",
  header: "Runs",
  id: "runs",
  enableHiding: true,
  hideByDefault: true,
  cell: () => {
    return isLoading ? <Skeleton className="h-3 w-1/2" /> : null;
  },
});
