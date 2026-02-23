import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import {
  DataTableControlsProvider,
  DataTableControls,
} from "@/src/components/table/data-table-controls";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { usePaginationState } from "@/src/hooks/usePaginationState";
import { useSidebarFilterState } from "@/src/features/filters/hooks/useSidebarFilterState";
import {
  getExperimentsColumnName,
  experimentsFilterConfig,
} from "./filter-config";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import {
  type FilterState,
  BatchExportTableName,
  TableViewPresetTableName,
  BatchActionType,
  ActionId,
} from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";
import { numberFormatter, usdFormatter } from "@/src/utils/numbers";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import {
  toAbsoluteTimeRange,
  type TableDateRange,
} from "@/src/utils/date-range-utils";
import { type ScoreAggregate } from "@langfuse/shared";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { BatchExportTableButton } from "@/src/components/BatchExportTableButton";
import { InfoIcon, MoreVertical, Columns3 } from "lucide-react";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { type Row, type RowSelectionState } from "@tanstack/react-table";
import TableIdOrName from "@/src/components/table/table-id";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useTableViewManager } from "@/src/components/table/table-view-presets/hooks/useTableViewManager";
import { useRouter } from "next/router";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import { useSelectAll } from "@/src/features/table/hooks/useSelectAll";
import { TableActionMenu } from "@/src/features/table/components/TableActionMenu";
import { type TableAction } from "@/src/features/table/types";
import { useScoreColumns } from "@/src/features/scores/hooks/useScoreColumns";
import { scoreFilters } from "@/src/features/scores/lib/scoreColumns";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { MemoizedIOTableCell } from "@/src/components/ui/IOTableCell";
import { useExperimentsTableData } from "../../hooks/useExperimentsTableData";
import { type ExperimentsTableRow, type ExperimentsTableProps } from "./types";

export default function ExperimentsTable({
  projectId,
  hideControls = false,
}: ExperimentsTableProps) {
  const router = useRouter();
  const { viewId } = router.query;

  const { setDetailPageList } = useDetailPageLists();
  const [selectedRows, setSelectedRows] = useState<RowSelectionState>({});

  const { selectAll, setSelectAll } = useSelectAll(projectId, "experiments");

  const [paginationState, setPaginationState] = usePaginationState(1, 50);

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(
    "experiments",
    "s",
  );

  const [inputFilterState] = useQueryFilterState([], "experiments", projectId);

  const [orderByState, setOrderByState] = useOrderByState({
    column: "createdAt",
    order: "DESC",
  });

  const { timeRange, setTimeRange } = useTableDateRange(projectId);

  // Convert timeRange to absolute date range for compatibility
  const tableDateRange = useMemo(() => {
    return toAbsoluteTimeRange(timeRange) ?? undefined;
  }, [timeRange]);

  const dateRangeFilter: FilterState = tableDateRange
    ? [
        {
          column: "createdAt",
          type: "datetime",
          operator: ">=",
          value: tableDateRange.from,
        },
        ...(tableDateRange.to
          ? [
              {
                column: "createdAt",
                type: "datetime",
                operator: "<=",
                value: tableDateRange.to,
              } as const,
            ]
          : []),
      ]
    : [];

  const oldFilterState = inputFilterState.concat(dateRangeFilter);

  // TODO: Implement filter options fetching when backend is ready
  const filterOptions = {};
  const isFilterOptionsPending = false;

  const queryFilter = useSidebarFilterState(
    experimentsFilterConfig,
    filterOptions,
    projectId,
    isFilterOptionsPending,
    hideControls,
  );

  // Create ref-based wrapper to avoid stale closure when queryFilter updates
  const queryFilterRef = useRef(queryFilter);
  queryFilterRef.current = queryFilter;

  const setFiltersWrapper = useCallback(
    (filters: FilterState) => queryFilterRef.current?.setFilterState(filters),
    [],
  );

  const combinedFilterState = queryFilter.filterState.concat(dateRangeFilter);

  const filterState = combinedFilterState;

  // Use the custom hook for experiments data fetching
  const { experiments, totalCount, handleBatchAction, dataUpdatedAt } =
    useExperimentsTableData({
      projectId,
      filterState,
      orderByState,
      paginationState,
      selectedRows,
      selectAll,
      setSelectedRows,
    });

  useEffect(() => {
    if (experiments.status === "success") {
      setDetailPageList(
        "experiments",
        experiments?.rows?.map((exp) => ({
          id: exp?.id,
          params: {},
        })) ?? [],
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experiments.status, experiments.rows]);

  const { scoreColumns, isLoading: isColumnLoading } =
    useScoreColumns<ExperimentsTableRow>({
      scoreColumnKey: "scores",
      projectId,
      filter: scoreFilters.forObservations(),
      fromTimestamp: tableDateRange?.from,
    });

  const { selectActionColumn } = TableSelectionManager<ExperimentsTableRow>({
    projectId,
    tableName: "experiments",
    setSelectedRows,
  });

  const tableActions: TableAction[] = [
    // TODO: Add experiment-specific actions (Compare, Delete, etc.)
  ];

  const enableSorting = !hideControls;

  const columns: LangfuseColumnDef<ExperimentsTableRow>[] = [
    ...(hideControls ? [] : [selectActionColumn]),
    {
      accessorKey: "name",
      id: "name",
      header: getExperimentsColumnName("name"),
      size: 200,
      enableSorting,
      cell: ({ row }) => {
        const value: string = row.getValue("name");
        return value ? <TableIdOrName value={value} /> : undefined;
      },
    },
    {
      accessorKey: "description",
      id: "description",
      header: getExperimentsColumnName("description"),
      size: 300,
      enableHiding: true,
      cell: ({ row }) => {
        const value: string | undefined = row.getValue("description");
        return value ? (
          <MemoizedIOTableCell
            isLoading={false}
            data={value}
            singleLine={rowHeight === "s"}
          />
        ) : undefined;
      },
    },
    {
      accessorKey: "itemCount",
      id: "itemCount",
      header: getExperimentsColumnName("itemCount"),
      size: 100,
      enableSorting,
      cell: ({ row }) => {
        const value: number = row.getValue("itemCount");
        return <span>{numberFormatter(value, 0)}</span>;
      },
    },
    {
      accessorKey: "errorCount",
      id: "errorCount",
      header: getExperimentsColumnName("errorCount"),
      size: 100,
      enableSorting,
      cell: ({ row }) => {
        const value: number = row.getValue("errorCount");
        return (
          <Badge
            variant={value > 0 ? "destructive" : "secondary"}
            className="max-w-fit rounded-sm px-1 font-normal"
          >
            {numberFormatter(value, 0)}
          </Badge>
        );
      },
      enableHiding: true,
    },
    {
      accessorKey: "totalCost",
      header: getExperimentsColumnName("totalCost"),
      id: "totalCost",
      size: 120,
      cell: ({ row }) => {
        const value: number | undefined = row.getValue("totalCost");
        return value !== undefined ? (
          <span>{usdFormatter(value)}</span>
        ) : undefined;
      },
      enableHiding: true,
      enableSorting,
    },
    {
      accessorKey: "createdAt",
      id: "createdAt",
      header: getExperimentsColumnName("createdAt"),
      size: 150,
      enableHiding: true,
      enableSorting,
      cell: ({ row }) => {
        const value: Date = row.getValue("createdAt");
        return <LocalIsoDate date={value} />;
      },
    },
    {
      accessorKey: "datasetId",
      id: "datasetId",
      header: getExperimentsColumnName("experimentDatasetId"),
      size: 150,
      enableSorting,
      cell: ({ row }) => {
        const value: string | undefined = row.getValue("datasetId");
        return value ? <TableIdOrName value={value} /> : undefined;
      },
    },
    {
      accessorKey: "scores",
      header: "Scores",
      id: "scores",
      enableHiding: true,
      defaultHidden: true,
      cell: () => {
        return isColumnLoading ? <Skeleton className="h-3 w-1/2" /> : null;
      },
      columns: scoreColumns,
    },
    {
      id: "actions",
      accessorKey: "actions",
      header: "Actions",
      size: 70,
      cell: ({ row }) => {
        const id: string = row.getValue("name");

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
              <DropdownMenuItem>
                <Columns3 className="mr-2 h-4 w-4" />
                <span>Compare</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const [columnVisibility, setColumnVisibilityState] =
    useColumnVisibility<ExperimentsTableRow>(
      `experimentsColumnVisibility-${projectId}`,
      columns,
    );

  const [columnOrder, setColumnOrder] = useColumnOrder<ExperimentsTableRow>(
    `experimentsColumnOrder-${projectId}`,
    columns,
  );

  const { isLoading: isViewLoading, ...viewControllers } = useTableViewManager({
    tableName: TableViewPresetTableName.Observations, // TODO: Create Experiments table view preset
    projectId,
    stateUpdaters: {
      setOrderBy: setOrderByState,
      setFilters: setFiltersWrapper,
      setColumnOrder: setColumnOrder,
      setColumnVisibility: setColumnVisibilityState,
    },
    validationContext: {
      columns,
      filterColumnDefinition: experimentsFilterConfig.columnDefinitions,
    },
    currentFilterState: queryFilter.filterState,
  });

  const rows: ExperimentsTableRow[] = useMemo(() => {
    return experiments.status === "success" && experiments.rows
      ? experiments.rows
      : [];
  }, [experiments]);

  return (
    <DataTableControlsProvider>
      <div className="flex h-full w-full flex-col">
        {/* Toolbar spanning full width */}
        {!hideControls && (
          <DataTableToolbar
            columns={columns}
            filterState={queryFilter.filterState}
            viewConfig={{
              tableName: TableViewPresetTableName.Observations, // TODO: Create Experiments preset
              projectId,
              controllers: viewControllers,
            }}
            columnsWithCustomSelect={["name", "datasetId"]}
            columnVisibility={columnVisibility}
            setColumnVisibility={setColumnVisibilityState}
            columnOrder={columnOrder}
            setColumnOrder={setColumnOrder}
            orderByState={orderByState}
            rowHeight={rowHeight}
            setRowHeight={setRowHeight}
            timeRange={timeRange}
            setTimeRange={setTimeRange}
            actionButtons={[
              <BatchExportTableButton
                {...{
                  projectId,
                  filterState,
                  orderByState,
                }}
                tableName={BatchExportTableName.Observations} // TODO: Add Experiments export
                key="batchExport"
              />,
              Object.keys(selectedRows).filter((experimentId) =>
                experiments.rows?.map((e) => e.id).includes(experimentId),
              ).length > 0 ? (
                <TableActionMenu
                  key="experiments-multi-select-actions"
                  projectId={projectId}
                  actions={tableActions}
                  tableName={BatchExportTableName.Observations} // TODO: Add Experiments batch actions
                />
              ) : null,
            ]}
            multiSelect={{
              selectAll,
              setSelectAll,
              selectedRowIds:
                Object.keys(selectedRows).filter((experimentId) =>
                  experiments.rows?.map((e) => e.id).includes(experimentId),
                ) ?? [],
              setRowSelection: setSelectedRows,
              totalCount,
              pageSize: paginationState.limit,
              pageIndex: paginationState.page - 1,
            }}
            filterWithAI
          />
        )}

        {/* Content area with sidebar and table */}
        <ResizableFilterLayout>
          {!hideControls && (
            <DataTableControls queryFilter={queryFilter} filterWithAI />
          )}

          <div className="flex flex-1 flex-col overflow-hidden">
            <DataTable
              key={`experiments-table-${dataUpdatedAt}`}
              tableName={"experiments"}
              columns={columns}
              data={
                experiments.status === "loading" || isViewLoading
                  ? { isLoading: true, isError: false }
                  : experiments.status === "error"
                    ? {
                        isLoading: false,
                        isError: true,
                        error: "",
                      }
                    : {
                        isLoading: false,
                        isError: false,
                        data: rows,
                      }
              }
              pagination={{
                totalCount,
                onChange: (updater) => {
                  const newState =
                    typeof updater === "function"
                      ? updater({
                          pageIndex: paginationState.page - 1,
                          pageSize: paginationState.limit,
                        })
                      : updater;
                  setPaginationState({
                    page: newState.pageIndex + 1,
                    limit: newState.pageSize,
                  });
                },
                state: {
                  pageIndex: paginationState.page - 1,
                  pageSize: paginationState.limit,
                },
              }}
              rowSelection={selectedRows}
              setRowSelection={setSelectedRows}
              setOrderBy={setOrderByState}
              orderBy={orderByState}
              columnOrder={columnOrder}
              onColumnOrderChange={setColumnOrder}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibilityState}
              rowHeight={rowHeight}
              onRowClick={(row, event) => {
                // Handle Command/Ctrl+click to open experiment in new tab
                if (event && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  const experimentId = row.id;
                  const experimentUrl = `/project/${projectId}/experiments/${encodeURIComponent(experimentId)}`;
                  const fullUrl = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${experimentUrl}`;
                  window.open(fullUrl, "_blank");
                }
                // For normal clicks, navigate to experiment detail page
                else {
                  void router.push(
                    `/project/${projectId}/experiments/${encodeURIComponent(row.id)}`,
                  );
                }
              }}
            />
          </div>
        </ResizableFilterLayout>
      </div>
    </DataTableControlsProvider>
  );
}
