import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { DatasetActionButton } from "@/src/features/datasets/components/DatasetActionButton";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";
import { MoreVertical } from "lucide-react";
import { useEffect } from "react";

type RowData = {
  key: {
    id: string;
    name: string;
  };
  createdAt: string;
  lastRunAt?: string;
  countItems: number;
  countRuns: number;
};

export function DatasetsTable(props: { projectId: string }) {
  const { setDetailPageList } = useDetailPageLists();
  const datasets = api.datasets.allDatasets.useQuery({
    projectId: props.projectId,
  });

  useEffect(() => {
    if (datasets.isSuccess) {
      setDetailPageList(
        "datasets",
        datasets.data.map((t) => t.id),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasets.isSuccess, datasets.data]);

  const columns: LangfuseColumnDef<RowData>[] = [
    {
      accessorKey: "key",
      header: "Name",
      cell: ({ row }) => {
        const key: RowData["key"] = row.getValue("key");
        return (
          <TableLink
            path={`/project/${props.projectId}/datasets/${key.id}`}
            value={key.name}
            truncateAt={50}
          />
        );
      },
    },
    {
      accessorKey: "countItems",
      header: "Items",
    },
    {
      accessorKey: "countRuns",
      header: "Runs",
    },
    {
      accessorKey: "createdAt",
      header: "Created",
    },
    {
      accessorKey: "lastRunAt",
      header: "Last Run",
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const key: RowData["key"] = row.getValue("key");
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DatasetActionButton
                mode="rename"
                projectId={props.projectId}
                datasetId={key.id}
                datasetName={key.name}
              />
              <DatasetActionButton
                mode="delete"
                projectId={props.projectId}
                datasetId={key.id}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const convertToTableRow = (
    item: RouterOutput["datasets"]["allDatasets"][number],
  ): RowData => {
    return {
      key: { id: item.id, name: item.name },
      createdAt: item.createdAt.toISOString(),
      lastRunAt: item.lastRunAt?.toISOString() ?? "",
      countItems: item.countDatasetItems,
      countRuns: item.countDatasetRuns,
    };
  };

  return (
    <div>
      <DataTable
        columns={columns}
        data={
          datasets.isLoading
            ? { isLoading: true, isError: false }
            : datasets.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: datasets.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: datasets.data.map((t) => convertToTableRow(t)),
                }
        }
      />
      <DatasetActionButton
        projectId={props.projectId}
        className="mt-4"
        mode="create"
      />
    </div>
  );
}
