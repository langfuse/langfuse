import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { api } from "@/src/utils/api";
import { safeExtract } from "@/src/utils/map-utils";
import { type RouterOutput } from "@/src/utils/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import { Archive, Edit, ListTree, MoreVertical, Trash2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  datasetItemFilterColumns,
  DatasetStatus,
  type Prisma,
} from "@langfuse/shared";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useEffect, useState } from "react";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { IOTableCell } from "@/src/components/ui/IOTableCell";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { StatusBadge } from "@/src/components/layouts/status-badge";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { BatchExportTableButton } from "@/src/components/BatchExportTableButton";
import { BatchExportTableName } from "@langfuse/shared";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { useDebounce } from "@/src/hooks/useDebounce";
import { useFullTextSearch } from "@/src/components/table/use-cases/useFullTextSearch";
import { useDatasetVersion } from "../hooks/useDatasetVersion";
import { EditDatasetItemDialog } from "./EditDatasetItemDialog";

type RowData = {
  id: string;
  source?: {
    traceId: string;
    observationId?: string;
  };
  status: DatasetStatus;
  createdAt: Date;
  input: Prisma.JsonValue;
  expectedOutput: Prisma.JsonValue;
  metadata: Prisma.JsonValue;
};

export function DatasetItemsTable({
  projectId,
  datasetId,
  menuItems,
}: {
  projectId: string;
  datasetId: string;
  menuItems?: React.ReactNode;
}) {
  const { setDetailPageList } = useDetailPageLists();
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(
    "datasetItems",
    "m",
  );

  const [filterState, setFilterState] = useQueryFilterState(
    [],
    "dataset_items",
    projectId,
  );

  const { searchQuery, searchType, setSearchQuery, setSearchType } =
    useFullTextSearch();

  const hasAccess = useHasProjectAccess({ projectId, scope: "datasets:CUD" });
  const { selectedVersion } = useDatasetVersion();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedItemForEdit, setSelectedItemForEdit] = useState<string | null>(
    null,
  );

  const items = api.datasets.itemsByDatasetId.useQuery({
    projectId,
    datasetId,
    filter: filterState,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    searchQuery: searchQuery ?? undefined,
    searchType: searchType,
    version: selectedVersion ?? undefined,
  });

  useEffect(() => {
    if (items.isSuccess) {
      const { datasetItems = [] } = items.data ?? {};
      setDetailPageList(
        "datasetItems",
        datasetItems.map((t) => ({ id: t.id })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.isSuccess, items.data]);

  const mutUpdate = api.datasets.updateDatasetItem.useMutation({
    onSuccess: () => utils.datasets.invalidate(),
  });

  const mutDelete = api.datasets.deleteDatasetItem.useMutation({
    onSuccess: () => utils.datasets.invalidate(),
  });

  // Fetch selected item and dataset for edit dialog
  const selectedItem = api.datasets.itemById.useQuery(
    {
      projectId,
      datasetId,
      datasetItemId: selectedItemForEdit!,
    },
    {
      enabled: selectedItemForEdit !== null && editDialogOpen,
    },
  );

  const dataset = api.datasets.byId.useQuery(
    {
      projectId,
      datasetId,
    },
    {
      enabled: editDialogOpen,
    },
  );

  const columns: LangfuseColumnDef<RowData>[] = [
    {
      accessorKey: "id",
      header: "Item id",
      id: "id",
      size: 90,
      isFixedPosition: true,
      cell: ({ row }) => {
        const id: string = row.getValue("id");
        const versionParam = selectedVersion
          ? `?version=${encodeURIComponent(selectedVersion.toISOString())}`
          : "";
        return (
          <TableLink
            path={`/project/${projectId}/datasets/${datasetId}/items/${id}${versionParam}`}
            value={id}
          />
        );
      },
    },
    {
      accessorKey: "source",
      header: "Source",
      headerTooltip: {
        description:
          "Link to the source trace based on which this item was added",
      },
      id: "source",
      size: 90,
      cell: ({ row }) => {
        const source: RowData["source"] = row.getValue("source");
        if (!source) return null;
        return source.observationId ? (
          <TableLink
            path={`/project/${projectId}/traces/${encodeURIComponent(source.traceId)}?observation=${encodeURIComponent(source.observationId)}`}
            value={source.observationId}
            icon={<ListTree className="h-4 w-4" />}
          />
        ) : (
          <TableLink
            path={`/project/${projectId}/traces/${encodeURIComponent(source.traceId)}`}
            value={source.traceId}
            icon={<ListTree className="h-4 w-4" />}
          />
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      id: "status",
      size: 80,
      cell: ({ row }) => {
        const status: DatasetStatus = row.getValue("status");
        return (
          <StatusBadge
            className="capitalize"
            type={status.toLowerCase()}
            isLive={false}
          />
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: "Created At",
      id: "createdAt",
      size: 150,
      enableHiding: true,
      cell: ({ row }) => {
        const value: RowData["createdAt"] = row.getValue("createdAt");
        return <LocalIsoDate date={value} />;
      },
    },
    {
      accessorKey: "input",
      header: "Input",
      id: "input",
      size: 200,
      enableHiding: true,
      cell: ({ row }) => {
        const input = row.getValue("input") as RowData["input"];
        return input !== null ? (
          <IOTableCell data={input} singleLine={rowHeight === "s"} />
        ) : null;
      },
    },
    {
      accessorKey: "expectedOutput",
      header: "Expected Output",
      id: "expectedOutput",
      size: 200,
      enableHiding: true,
      cell: ({ row }) => {
        const expectedOutput = row.getValue(
          "expectedOutput",
        ) as RowData["expectedOutput"];
        return expectedOutput !== null ? (
          <IOTableCell
            data={expectedOutput}
            className="bg-accent-light-green"
            singleLine={rowHeight === "s"}
          />
        ) : null;
      },
    },
    {
      accessorKey: "metadata",
      header: "Metadata",
      id: "metadata",
      size: 200,
      enableHiding: true,
      cell: ({ row }) => {
        const metadata = row.getValue("metadata") as RowData["metadata"];
        return metadata !== null ? (
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
        const id: string = row.getValue("id");
        const status: DatasetStatus = row.getValue("status");
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only [position:relative]">Open menu</span>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={!hasAccess || !!selectedVersion}
                onClick={() => {
                  setSelectedItemForEdit(id);
                  setEditDialogOpen(true);
                }}
              >
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!hasAccess || !!selectedVersion}
                onClick={() => {
                  capture("dataset_item:archive_toggle", {
                    status:
                      status === DatasetStatus.ARCHIVED
                        ? "unarchived"
                        : "archived",
                  });
                  mutUpdate.mutate({
                    projectId: projectId,
                    datasetId: datasetId,
                    datasetItemId: id,
                    status:
                      status === DatasetStatus.ARCHIVED
                        ? DatasetStatus.ACTIVE
                        : DatasetStatus.ARCHIVED,
                  });
                }}
              >
                <Archive className="mr-2 h-4 w-4" />
                {status === DatasetStatus.ARCHIVED ? "Unarchive" : "Archive"}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!hasAccess || !!selectedVersion}
                className="text-destructive"
                onClick={() => {
                  if (
                    window.confirm(
                      "Are you sure you want to delete this item? This will also delete all run items that belong to this item.",
                    )
                  ) {
                    capture("dataset_item:delete");
                    mutDelete.mutate({
                      projectId: projectId,
                      datasetId: datasetId,
                      datasetItemId: id,
                    });
                  }
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const convertToTableRow = (
    item: RouterOutput["datasets"]["itemsByDatasetId"]["datasetItems"][number],
  ): RowData => {
    return {
      id: item.id,
      source: item.sourceTraceId
        ? {
            traceId: item.sourceTraceId,
            observationId: item.sourceObservationId ?? undefined,
          }
        : undefined,
      status: item.status ?? "ACTIVE",
      createdAt: item.createdAt,
      input: item.input,
      expectedOutput: item.expectedOutput,
      metadata: item.metadata,
    };
  };

  const [columnVisibility, setColumnVisibility] = useColumnVisibility<RowData>(
    "datasetItemsColumnVisibility",
    columns,
  );

  const [columnOrder, setColumnOrder] = useColumnOrder<RowData>(
    "datasetItemsColumnOrder",
    columns,
  );

  const batchExportButton = (
    <BatchExportTableButton
      key="batchExport"
      projectId={projectId}
      tableName={BatchExportTableName.DatasetItems}
      orderByState={{ column: "createdAt", order: "DESC" }}
      filterState={[
        {
          type: "string",
          operator: "=",
          column: "datasetId",
          value: datasetId,
        },
      ]}
    />
  );

  const setFilterStateWithDebounce = useDebounce(setFilterState);
  const setSearchQueryWithDebounce = useDebounce(setSearchQuery, 300);

  return (
    <>
      <DataTableToolbar
        columns={columns}
        filterColumnDefinition={datasetItemFilterColumns}
        filterState={filterState}
        setFilterState={setFilterStateWithDebounce}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
        columnOrder={columnOrder}
        setColumnOrder={setColumnOrder}
        rowHeight={rowHeight}
        setRowHeight={setRowHeight}
        actionButtons={[menuItems, batchExportButton].filter(Boolean)}
        searchConfig={{
          metadataSearchFields: ["ID"],
          updateQuery: setSearchQueryWithDebounce,
          currentQuery: searchQuery ?? undefined,
          tableAllowsFullTextSearch: true,
          setSearchType,
          searchType,
          customDropdownLabels: {
            metadata: "IDs",
            fullText: "Full Text",
          },
          hidePerformanceWarning: true,
        }}
      />
      <DataTable
        tableName={"datasetItems"}
        columns={columns}
        data={
          items.isPending
            ? { isLoading: true, isError: false }
            : items.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: items.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: safeExtract(items.data, "datasetItems", []).map((t) =>
                    convertToTableRow(t),
                  ),
                }
        }
        pagination={{
          totalCount: items.data?.totalDatasetItems ?? null,
          onChange: setPaginationState,
          state: paginationState,
        }}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        columnOrder={columnOrder}
        onColumnOrderChange={setColumnOrder}
        rowHeight={rowHeight}
      />
      <EditDatasetItemDialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setSelectedItemForEdit(null);
          }
        }}
        projectId={projectId}
        datasetItem={selectedItem.data ?? null}
        dataset={
          dataset.data
            ? {
                id: dataset.data.id,
                name: dataset.data.name,
                inputSchema: dataset.data.inputSchema ?? null,
                expectedOutputSchema: dataset.data.expectedOutputSchema ?? null,
              }
            : null
        }
      />
    </>
  );
}
