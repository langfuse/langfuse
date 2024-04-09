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
import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import { type RouterOutput } from "@/src/utils/types";
import { MoreVertical } from "lucide-react";
import { useEffect } from "react";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";

type RowData = {
  key: {
    id: string;
    name: string;
  };
  description: string;
  createdAt: string;
  lastRunAt?: string;
  countItems: number;
  countRuns: number;
};

export function DatasetsTable(props: { projectId: string }) {
  const { setDetailPageList } = useDetailPageLists();

  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const datasets = api.datasets.allDatasets.useQuery({
    projectId: props.projectId,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
  });

  useEffect(() => {
    if (datasets.isSuccess) {
      setDetailPageList(
        "datasets",
        datasets.data.datasets.map((t) => t.id),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasets.isSuccess, datasets.data]);

  const columns: LangfuseColumnDef<RowData>[] = [
    {
      accessorKey: "key",
      header: "Name",
      id: "key",
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
      accessorKey: "description",
      header: "Description",
      id: "description",
      enableHiding: true,
    },
    {
      accessorKey: "countItems",
      header: "Items",
      id: "countItems",
      enableHiding: true,
    },
    {
      accessorKey: "countRuns",
      header: "Runs",
      id: "countRuns",
      enableHiding: true,
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      id: "createdAt",
      enableHiding: true,
    },
    {
      accessorKey: "lastRunAt",
      header: "Last Run",
      id: "lastRunAt",
      enableHiding: true,
    },
    {
      id: "actions",
      accessorKey: "actions",
      header: "Actions",
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
                mode="update"
                projectId={props.projectId}
                datasetId={key.id}
                datasetName={key.name}
                datasetDescription={row.getValue("description") ?? undefined}
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
    item: RouterOutput["datasets"]["allDatasets"]["datasets"][number],
  ): RowData => {
    return {
      key: { id: item.id, name: item.name },
      description: item.description ?? "",
      createdAt: item.createdAt.toLocaleString(),
      lastRunAt: item.lastRunAt?.toLocaleString() ?? "",
      countItems: item.countDatasetItems,
      countRuns: item.countDatasetRuns,
    };
  };

  const [columnVisibility, setColumnVisibility] = useColumnVisibility<RowData>(
    "datasetsColumnVisibility",
    columns,
  );

  return (
    <div>
      <DataTableToolbar
        columns={columns}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
      />
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
                  data: datasets.data.datasets.map((t) => convertToTableRow(t)),
                }
        }
        pagination={{
          pageCount: Math.ceil(
            (datasets.data?.totalDatasets ?? 0) / paginationState.pageSize,
          ),
          onChange: setPaginationState,
          state: paginationState,
        }}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
      />
    </div>
  );
}
