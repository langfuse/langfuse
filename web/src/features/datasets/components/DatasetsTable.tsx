import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { DatasetActionButton } from "@/src/features/datasets/components/DatasetActionButton";
import { DatasetSchemaHoverCard } from "@/src/features/datasets/components/DatasetSchemaHoverCard";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { api } from "@/src/utils/api";
import { withDefault, useQueryParam, StringParam } from "use-query-params";
import { type RouterOutput } from "@/src/utils/types";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
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
import { TableCheckboxLoadingCell } from "@/src/components/table/loading-cells";
import { FolderBreadcrumb } from "@/src/features/folders/components/FolderBreadcrumb";
import { buildFullPath } from "@/src/features/folders/utils";
import { FolderBreadcrumbLink } from "@/src/features/folders/components/FolderBreadcrumbLink";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Button } from "@/src/components/ui/button";
import { Trash, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  createDatasetsTableStore,
  type DatasetsTableStore,
} from "@/src/features/datasets/components/datasetsTableStore";
import { useStore } from "zustand";
import {
  useTableRowIsSelected,
  useTableRowSelection,
} from "@/src/components/table/table-selection-store";
import { type Row, type Table } from "@tanstack/react-table";

type DatasetTableRow = {
  id: string;
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
    id: data.isFolder ? `folder:${data.folderPath}` : data.key.id,
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

function DatasetSelectionHeaderCheckbox({
  store,
  table,
}: {
  store: DatasetsTableStore;
  table: Table<DatasetTableRow>;
}) {
  const pageDatasetRowIds = table.getRowModel().rows.map((row) => row.id);
  const rowSelection = useTableRowSelection(store, {});
  const allPageRowsSelected =
    pageDatasetRowIds.length > 0 &&
    pageDatasetRowIds.every((rowId) => Boolean(rowSelection[rowId]));
  const somePageRowsSelected =
    !allPageRowsSelected &&
    pageDatasetRowIds.some((rowId) => Boolean(rowSelection[rowId]));

  return (
    <div className="flex h-full items-center">
      <Checkbox
        checked={
          allPageRowsSelected
            ? true
            : somePageRowsSelected
              ? "indeterminate"
              : false
        }
        onCheckedChange={(value) => {
          if (value) {
            store.getState().actions.togglePageRows(pageDatasetRowIds, true);
          } else {
            store.getState().actions.clearSelection();
          }
        }}
        aria-label="Select all"
        className="opacity-60"
        disabled={pageDatasetRowIds.length === 0}
      />
    </div>
  );
}

function DatasetSelectionRowCheckbox({
  row,
  store,
}: {
  row: Row<DatasetTableRow>;
  store: DatasetsTableStore;
}) {
  const rowIsSelected = useTableRowIsSelected(store, row.id, false);

  return (
    <div onClick={(event) => event.stopPropagation()}>
      <Checkbox
        checked={rowIsSelected}
        onCheckedChange={(value) => {
          store.getState().actions.toggleRow(row.id, Boolean(value));
        }}
        aria-label="Select row"
        className="opacity-60"
      />
    </div>
  );
}

function DatasetsMultiSelectDeleteActionBar({
  projectId,
  rowsById,
  store,
}: {
  projectId: string;
  rowsById: Map<string, DatasetTableRow>;
  store: DatasetsTableStore;
}) {
  const selectedRowIds = useStore(store, (state) => state.selectedPageRowIds);
  const selectedRows = selectedRowIds
    .map((rowId) => rowsById.get(rowId))
    .filter((row): row is DatasetTableRow => Boolean(row));
  const selectedDatasetRows = selectedRows.filter((row) => !row.isFolder);
  const selectedFolderRows = selectedRows.filter((row) => row.isFolder);
  const clearSelection = useStore(
    store,
    (state) => state.actions.clearSelection,
  );
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const hasDeleteAccess = useHasProjectAccess({
    projectId,
    scope: "datasets:CUD",
  });
  const deleteMutation = api.datasets.deleteDataset.useMutation();
  const deleteFolderMutation = api.datasets.deleteDatasetFolder.useMutation();
  const isDeletePending =
    deleteMutation.isPending || deleteFolderMutation.isPending;

  if (selectedRows.length === 0) return null;

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-16 z-50 flex justify-center">
        <div className="ring-dark-blue/20 dark:border-dark-blue/30 dark:ring-dark-blue/30 bg-background pointer-events-auto flex items-center gap-2 rounded-lg border px-3 py-2 opacity-95 shadow-lg ring-2 backdrop-blur-md dark:shadow-none">
          <div className="text-sm font-medium">
            {selectedRows.length} selected
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={clearSelection}
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="bg-border h-5 w-px" />
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            title="Delete"
            disabled={!hasDeleteAccess}
            onClick={() => {
              capture("datasets:delete_form_open", {
                source: "table-multi-select",
              });
              setIsDeleteDialogOpen(true);
            }}
          >
            <Trash className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Delete</span>
          </Button>
        </div>
      </div>

      <Dialog
        open={isDeleteDialogOpen}
        onOpenChange={(isOpen) => {
          if (!isDeletePending) {
            setIsDeleteDialogOpen(isOpen);
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="mb-4">Please confirm</DialogTitle>
            <DialogDescription className="p-0">
              This action cannot be undone and removes all data associated with{" "}
              {selectedRows.length} selected item
              {selectedRows.length > 1 ? "s" : ""}. Selected folders delete all
              datasets contained in them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="destructive"
              loading={isDeletePending}
              disabled={isDeletePending}
              onClick={async (event) => {
                event.preventDefault();
                capture("datasets:delete_form_submit", {
                  source: "table-multi-select",
                  count: selectedRows.length,
                  datasets: selectedDatasetRows.length,
                  folders: selectedFolderRows.length,
                });
                await Promise.all([
                  ...selectedDatasetRows.map((row) =>
                    deleteMutation.mutateAsync({
                      projectId,
                      datasetId: row.key.id,
                    }),
                  ),
                  ...selectedFolderRows.map((row) =>
                    deleteFolderMutation.mutateAsync({
                      projectId,
                      folderPath: row.folderPath,
                    }),
                  ),
                ]);
                await utils.datasets.invalidate();
                clearSelection();
                setIsDeleteDialogOpen(false);
              }}
            >
              Delete Selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DatasetsTable(props: { projectId: string }) {
  const { setDetailPageList } = useDetailPageLists();
  const [rowHeight, setRowHeight] = useRowHeightLocalStorage("datasets", "s");
  const [datasetsTableStore] = useState(() => createDatasetsTableStore());

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
      id: "select",
      accessorKey: "select",
      size: 35,
      isFixedPosition: true,
      isPinnedLeft: true,
      loadingCell: <TableCheckboxLoadingCell />,
      header: ({ table }) => (
        <DatasetSelectionHeaderCheckbox
          table={table}
          store={datasetsTableStore}
        />
      ),
      cell: ({ row }) => (
        <DatasetSelectionRowCheckbox row={row} store={datasetsTableStore} />
      ),
    },
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
            path={`/project/${props.projectId}/datasets/${encodeURIComponent(key.id)}/items`}
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
      header: "Experiments",
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
          <div className="flex items-center gap-1">
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
              icon
              variant="ghost"
              size="icon-xs"
            />
            <DatasetActionButton
              mode="delete"
              projectId={props.projectId}
              datasetId={key.id}
              datasetName={row.original.folderPath}
              icon
              variant="ghost"
              size="icon-xs"
            />
          </div>
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

  const pageDatasetRowIds = useMemo(
    () => processedRowData.rows.map((row) => row.id),
    [processedRowData.rows],
  );

  const rowsById = useMemo(
    () => new Map(processedRowData.rows.map((row) => [row.id, row])),
    [processedRowData.rows],
  );

  useLayoutEffect(() => {
    datasetsTableStore.getState().actions.syncPageRows({
      pageRowIds: pageDatasetRowIds,
      totalCount: datasets.data?.totalDatasets ?? null,
    });
  }, [datasets.data?.totalDatasets, datasetsTableStore, pageDatasetRowIds]);

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
        actionButtons={[
          <DatasetsMultiSelectDeleteActionBar
            key="datasets-multi-select-delete"
            projectId={props.projectId}
            rowsById={rowsById}
            store={datasetsTableStore}
          />,
        ]}
      />
      <DataTable
        tableName={"datasets"}
        columns={columns}
        selectionStore={datasetsTableStore}
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
