import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { DatasetActionButton } from "@/src/features/datasets/components/DatasetActionButton";
import { DatasetSchemaHoverCard } from "@/src/features/datasets/components/DatasetSchemaHoverCard";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { api } from "@/src/utils/api";
import { withDefault, useQueryParam, StringParam } from "use-query-params";
import { type RouterOutput } from "@/src/utils/types";
import { MoreVertical } from "lucide-react";
import { useEffect, useMemo } from "react";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { TableViewPresetTableName, type Prisma } from "@langfuse/shared";
import { IOTableCell } from "@/src/components/ui/IOTableCell";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";
import { useTableViewManager } from "@/src/components/table/table-view-presets/hooks/useTableViewManager";
import { useFolderPagination } from "@/src/features/folders/hooks/useFolderPagination";
import { FolderBreadcrumb } from "@/src/features/folders/components/FolderBreadcrumb";
import { buildFullPath } from "@/src/features/folders/utils";
import { FolderBreadcrumbLink } from "@/src/features/folders/components/FolderBreadcrumbLink";

type DatasetTableRow = {
  key: {
    id: string;
    name: string; // Display name (segment only)
  };
  isFolder: boolean;
  folderPath: string; // Full name-based path for folder navigation and dataset updates
  description?: string | null;
  createdAt?: Date | null;
  lastRunAt: Date | null;
  countItems: number | null;
  countRuns: number | null;
  metadata: Prisma.JsonValue | null;
  inputSchema?: Prisma.JsonValue | null;
  expectedOutputSchema?: Prisma.JsonValue | null;
};

function createRow(
  data: Partial<DatasetTableRow> & {
    key: {
      id: string;
      name: string;
    };
    folderPath: string;
    isFolder: boolean;
  },
): DatasetTableRow {
  return {
    description: null,
    createdAt: null,
    lastRunAt: null,
    countItems: null,
    countRuns: null,
    metadata: null,
    inputSchema: null,
    expectedOutputSchema: null,
    ...data,
  };
}

export function DatasetsTable(props: { projectId: string }) {
  const { setDetailPageList } = useDetailPageLists();
  const [rowHeight, setRowHeight] = useRowHeightLocalStorage("datasets", "s");

  const {
    paginationState,
    currentFolderPath,
    navigateToFolder,
    resetPaginationAndFolder,
    setPaginationAndFolderState,
  } = useFolderPagination();

  const [searchQuery, setSearchQuery] = useQueryParam(
    "search",
    withDefault(StringParam, null),
  );

  // Reset pagination when search query changes
  useEffect(() => {
    resetPaginationAndFolder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const datasets = api.datasets.allDatasets.useQuery({
    projectId: props.projectId,
    searchQuery,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    pathPrefix: currentFolderPath,
  });

  const metrics = api.datasets.allDatasetsMetrics.useQuery(
    {
      projectId: props.projectId,
      datasetIds: datasets.data?.datasets.map((t) => t.id) ?? [],
    },
    {
      enabled: datasets.isSuccess,
    },
  );

  useEffect(() => {
    if (datasets.isSuccess) {
      setDetailPageList(
        "datasets",
        datasets.data.datasets.map((t) => ({ id: t.id })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasets.isSuccess, datasets.data]);

  const columns: LangfuseColumnDef<DatasetTableRow>[] = [
    {
      accessorKey: "key",
      header: "Name",
      id: "key",
      size: 150,
      isFixedPosition: true,
      cell: ({ row }) => {
        const key: DatasetTableRow["key"] = row.getValue("key");
        const rowData = row.original;

        if (rowData.isFolder) {
          return (
            <FolderBreadcrumbLink
              name={key.name}
              onClick={() => navigateToFolder(rowData.folderPath)}
            />
          );
        }

        return (
          <TableLink
            path={`/project/${props.projectId}/datasets/${encodeURIComponent(key.id)}`}
            value={key.name}
          />
        );
      },
    },
    {
      accessorKey: "description",
      header: "Description",
      id: "description",
      enableHiding: true,
      size: 200,
      cell: ({ row }) => {
        const description: DatasetTableRow["description"] =
          row.getValue("description");
        return description;
      },
    },
    {
      accessorKey: "countItems",
      header: "Items",
      id: "countItems",
      enableHiding: true,
      size: 60,
    },
    {
      accessorKey: "countRuns",
      header: "Runs",
      id: "countRuns",
      enableHiding: true,
      size: 60,
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      id: "createdAt",
      enableHiding: true,
      size: 150,
      cell: ({ row }) => {
        const value: DatasetTableRow["createdAt"] = row.getValue("createdAt");
        return value ? <LocalIsoDate date={value} /> : undefined;
      },
    },
    {
      accessorKey: "lastRunAt",
      header: "Last Run",
      id: "lastRunAt",
      enableHiding: true,
      size: 150,
      cell: ({ row }) => {
        const value: DatasetTableRow["lastRunAt"] = row.getValue("lastRunAt");
        return value ? <LocalIsoDate date={value} /> : undefined;
      },
    },
    {
      accessorKey: "inputSchema",
      header: "Input Schema",
      id: "inputSchema",
      enableHiding: true,
      size: 80,
      cell: ({ row }) => {
        const inputSchema: DatasetTableRow["inputSchema"] =
          row.getValue("inputSchema");

        if (!inputSchema) return null;

        return (
          <DatasetSchemaHoverCard schema={inputSchema} schemaType="input" />
        );
      },
    },
    {
      accessorKey: "expectedOutputSchema",
      header: "Expected Output Schema",
      id: "expectedOutputSchema",
      enableHiding: true,
      size: 90,
      cell: ({ row }) => {
        const expectedOutputSchema: DatasetTableRow["expectedOutputSchema"] =
          row.getValue("expectedOutputSchema");

        if (!expectedOutputSchema) return null;

        return (
          <DatasetSchemaHoverCard
            schema={expectedOutputSchema}
            schemaType="expectedOutput"
          />
        );
      },
    },
    {
      accessorKey: "metadata",
      header: "Metadata",
      id: "metadata",
      enableHiding: true,
      size: 300,
      cell: ({ row }) => {
        const metadata: DatasetTableRow["metadata"] = row.getValue("metadata");
        return !!metadata ? (
          <IOTableCell data={metadata} singleLine={rowHeight === "s"} />
        ) : null;
      },
    },
    {
      id: "actions",
      accessorKey: "actions",
      header: "Actions",
      size: 70,
      cell: ({ row }) => {
        const key: DatasetTableRow["key"] = row.getValue("key");

        if (row.original.isFolder) {
          return null;
        }

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="flex flex-col [&>*]:w-full [&>*]:justify-start"
            >
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <DatasetActionButton
                  mode="update"
                  projectId={props.projectId}
                  datasetId={key.id}
                  datasetName={row.original.folderPath}
                  datasetDescription={row.getValue("description") ?? undefined}
                  datasetMetadata={row.getValue("metadata") ?? undefined}
                  datasetInputSchema={row.original.inputSchema ?? undefined}
                  datasetExpectedOutputSchema={
                    row.original.expectedOutputSchema ?? undefined
                  }
                />
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <DatasetActionButton
                  mode="delete"
                  projectId={props.projectId}
                  datasetId={key.id}
                  datasetName={row.original.folderPath}
                />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  type CoreOutput = RouterOutput["datasets"]["allDatasets"]["datasets"][number];
  type MetricsOutput =
    RouterOutput["datasets"]["allDatasetsMetrics"]["metrics"][number];

  const datasetsDatasetTableRow = joinTableCoreAndMetrics<
    CoreOutput,
    MetricsOutput
  >(datasets.data?.datasets, metrics.data?.metrics);

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<DatasetTableRow>("datasetsColumnVisibility", columns);

  const [columnOrder, setColumnOrder] = useColumnOrder<DatasetTableRow>(
    "datasetsColumnOrder",
    columns,
  );

  const { isLoading: isViewLoading, ...viewControllers } = useTableViewManager({
    tableName: TableViewPresetTableName.Datasets,
    projectId: props.projectId,
    stateUpdaters: {
      setColumnOrder: setColumnOrder,
      setColumnVisibility: setColumnVisibility,
      setSearchQuery: setSearchQuery,
    },
    validationContext: {
      columns,
    },
  });

  // Backend returns folder representatives with row_type metadata
  const processedRowData = useMemo(() => {
    if (!datasetsDatasetTableRow.rows)
      return { ...datasetsDatasetTableRow, rows: [] };

    const combinedRows: DatasetTableRow[] = [];

    for (const dataset of datasetsDatasetTableRow.rows) {
      const isFolder = dataset.row_type === "folder";
      const itemName = dataset.name; // Backend returns folder segment name for folders
      const folderPath = buildFullPath(currentFolderPath, itemName);

      combinedRows.push(
        createRow({
          key: {
            id: dataset.id,
            name: dataset.name,
          },
          folderPath,
          isFolder,
          ...(isFolder
            ? {}
            : {
                description: dataset.description,
                createdAt: dataset.createdAt,
                lastRunAt: dataset.lastRunAt,
                countItems: dataset.countDatasetItems,
                countRuns: dataset.countDatasetRuns,
                metadata: dataset.metadata,
                inputSchema: dataset.inputSchema,
                expectedOutputSchema: dataset.expectedOutputSchema,
              }),
        }),
      );
    }

    return {
      ...datasetsDatasetTableRow,
      rows: combinedRows,
    };
  }, [datasetsDatasetTableRow, currentFolderPath]);

  return (
    <>
      {currentFolderPath && (
        <FolderBreadcrumb
          currentFolderPath={currentFolderPath}
          navigateToFolder={navigateToFolder}
        />
      )}
      <DataTableToolbar
        columns={columns}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
        columnOrder={columnOrder}
        setColumnOrder={setColumnOrder}
        rowHeight={rowHeight}
        setRowHeight={setRowHeight}
        searchConfig={{
          metadataSearchFields: ["Name"],
          updateQuery: setSearchQuery,
          currentQuery: searchQuery ?? undefined,
          tableAllowsFullTextSearch: false,
          setSearchType: undefined,
          searchType: undefined,
        }}
        viewConfig={{
          tableName: TableViewPresetTableName.Datasets,
          projectId: props.projectId,
          controllers: viewControllers,
        }}
      />
      <DataTable
        tableName={"datasets"}
        columns={columns}
        data={
          datasets.isLoading || isViewLoading
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
                  data: processedRowData.rows,
                }
        }
        pagination={{
          totalCount: datasets.data?.totalDatasets ?? null,
          onChange: setPaginationAndFolderState,
          state: paginationState,
        }}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        columnOrder={columnOrder}
        onColumnOrderChange={setColumnOrder}
        rowHeight={rowHeight}
      />
    </>
  );
}
