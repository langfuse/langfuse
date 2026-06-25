import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { DatasetActionButton } from "@/src/features/datasets/components/DatasetActionButton";
import { DatasetSchemaHoverCard } from "@/src/features/datasets/components/DatasetSchemaHoverCard";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { api } from "@/src/utils/api";
import { withDefault, useQueryParam, StringParam } from "use-query-params";
import { type RouterOutput } from "@/src/utils/types";
import { useEffect, useMemo, useState } from "react";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import {
  TableViewPresetTableName,
  type Prisma,
  type TableViewPresetState,
} from "@langfuse/shared";
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
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  createDatasetsTableStore,
  toFolderRowId,
  type DatasetsTableStore,
} from "@/src/features/datasets/store/datasetsTableStore";
import { useDatasetsTableSelectionSync } from "@/src/features/datasets/hooks/useDatasetsTableSelectionSync";
import { useStore } from "zustand";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import { TableActionMenu } from "@/src/features/table/components/TableActionMenu";
import {
  ActionId,
  BatchActionType,
  BatchExportTableName,
} from "@langfuse/shared";
import { type TableAction } from "@/src/features/table/types";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";

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

type DatasetTableViewControllers = {
  applyViewState: (viewData: TableViewPresetState) => void;
  selectedViewId: string | null;
  appliedViewId: string | null;
  handleSetViewId: (viewId: string | null) => void;
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
    id: data.isFolder ? toFolderRowId(data.folderPath) : data.key.id,
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

function DatasetsMultiSelectActionMenu({
  currentFolderPath,
  projectId,
  searchQuery,
  store,
}: {
  currentFolderPath: string | undefined;
  projectId: string;
  searchQuery: string | null;
  store: DatasetsTableStore;
}) {
  const selectAll = useStore(store, (state) => state.selectAll);
  const selectedCount = useStore(
    store,
    (state) => state.selectedPageRowIds.length,
  );
  const clearSelection = useStore(
    store,
    (state) => state.actions.clearSelection,
  );
  const deleteSelected = useStore(
    store,
    (state) => state.actions.deleteSelected,
  );
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const deleteManyMutation = api.datasets.deleteMany.useMutation({
    onSuccess: () => {
      showSuccessToast({
        title: "Datasets deleted",
        description:
          "Selected datasets will be deleted. Associated run items and media links are cleaned up asynchronously.",
      });
    },
    onSettled: () => {
      utils.datasets.invalidate();
    },
  });

  if (selectedCount === 0 && !selectAll) return null;

  const tableActions: TableAction[] = [
    {
      id: ActionId.DatasetDelete,
      type: BatchActionType.Delete,
      label: "Delete",
      description:
        "This action cannot be undone. Selected folders delete all datasets contained in them.",
      accessCheck: {
        scope: "datasets:CUD",
      },
      execute: ({ projectId }) =>
        deleteSelected({
          projectId,
          deleteMany: deleteManyMutation.mutateAsync,
          capture,
          scope: { folderPath: currentFolderPath, searchQuery },
        }),
    },
  ];

  return (
    <TableActionMenu
      projectId={projectId}
      actions={tableActions}
      tableName={BatchExportTableName.Datasets}
      selectedCount={selectedCount}
      approximateCount={selectAll}
      onClearSelection={clearSelection}
    />
  );
}

function DatasetsTableToolbar({
  columnOrder,
  columnVisibility,
  columns,
  currentFolderPath,
  paginationState,
  projectId,
  rowHeight,
  searchQuery,
  setColumnOrder,
  setColumnVisibility,
  setRowHeight,
  setSearchQuery,
  store,
  totalCount,
  viewControllers,
}: {
  columnOrder: ReturnType<typeof useColumnOrder<DatasetTableRow>>[0];
  columnVisibility: ReturnType<typeof useColumnVisibility<DatasetTableRow>>[0];
  columns: LangfuseColumnDef<DatasetTableRow>[];
  currentFolderPath: string | undefined;
  paginationState: { pageIndex: number; pageSize: number };
  projectId: string;
  rowHeight: ReturnType<typeof useRowHeightLocalStorage>[0];
  searchQuery: string | null;
  setColumnOrder: ReturnType<typeof useColumnOrder<DatasetTableRow>>[1];
  setColumnVisibility: ReturnType<
    typeof useColumnVisibility<DatasetTableRow>
  >[1];
  setRowHeight: ReturnType<typeof useRowHeightLocalStorage>[1];
  setSearchQuery: (value: string | null | undefined) => void;
  store: DatasetsTableStore;
  totalCount: number | null;
  viewControllers: DatasetTableViewControllers;
}) {
  const selectAll = useStore(store, (state) => state.selectAll);
  const selectedPageRowIds = useStore(
    store,
    (state) => state.selectedPageRowIds,
  );
  const selectionActions = useStore(store, (state) => state.actions);

  return (
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
        projectId,
        controllers: viewControllers,
      }}
      actionButtons={[
        <DatasetsMultiSelectActionMenu
          key="datasets-multi-select-delete"
          currentFolderPath={currentFolderPath}
          projectId={projectId}
          searchQuery={searchQuery}
          store={store}
        />,
      ]}
      multiSelect={{
        selectAll,
        setSelectAll: selectionActions.setSelectAll,
        selectedRowIds: selectedPageRowIds,
        setRowSelection: selectionActions.setRowSelection,
        totalCount,
        // A folder row deletes every dataset under it, so the displayed row
        // count understates the true deletion scope — keep the banner vague.
        approximateCount: true,
        ...paginationState,
      }}
    />
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

  const { selectActionColumn } = TableSelectionManager<DatasetTableRow>({
    projectId: props.projectId,
    tableName: "datasets",
    setSelectedRows: datasetsTableStore.getState().actions.setRowSelection,
    setSelectAll: datasetsTableStore.getState().actions.setSelectAll,
    selectionStore: datasetsTableStore,
  });

  const columns: LangfuseColumnDef<DatasetTableRow>[] = [
    selectActionColumn,
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

  const pageRowIds = useMemo(
    () => processedRowData.rows.map((row) => row.id),
    [processedRowData.rows],
  );

  const selectAll = useStore(datasetsTableStore, (state) => state.selectAll);

  useDatasetsTableSelectionSync({
    store: datasetsTableStore,
    pageRowIds,
    totalCount: datasets.data?.totalDatasets ?? null,
    currentFolderPath,
    searchQuery,
  });

  return (
    <>
      {currentFolderPath && (
        <FolderBreadcrumb
          currentFolderPath={currentFolderPath}
          navigateToFolder={navigateToFolder}
        />
      )}
      <DatasetsTableToolbar
        columns={columns}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
        columnOrder={columnOrder}
        setColumnOrder={setColumnOrder}
        rowHeight={rowHeight}
        setRowHeight={setRowHeight}
        currentFolderPath={currentFolderPath}
        paginationState={paginationState}
        projectId={props.projectId}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        store={datasetsTableStore}
        totalCount={datasets.data?.totalDatasets ?? null}
        viewControllers={viewControllers}
      />
      <DataTable
        tableName={"datasets"}
        columns={columns}
        selectionStore={datasetsTableStore}
        highlightAllRows={selectAll}
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
