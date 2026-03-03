import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import {
  DataTableControlsProvider,
  DataTableControls,
} from "@/src/components/table/data-table-controls";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { usePaginationState } from "@/src/hooks/usePaginationState";
import { useSidebarFilterState } from "@/src/features/filters/hooks/useSidebarFilterState";
import {
  getExperimentItemsColumnName,
  experimentItemsFilterConfig,
} from "../../config/experiment-items-filter-config";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type FilterState, TableViewPresetTableName } from "@langfuse/shared";
import { usdFormatter } from "@/src/utils/numbers";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import Link from "next/link";
import { type RowSelectionState } from "@tanstack/react-table";
import TableIdOrName from "@/src/components/table/table-id";
import { PeekViewObservationDetail } from "@/src/components/table/peek/peek-observation-detail";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useTableViewManager } from "@/src/components/table/table-view-presets/hooks/useTableViewManager";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import { useSelectAll } from "@/src/features/table/hooks/useSelectAll";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import {
  IOTableCell,
  MemoizedIOTableCell,
} from "@/src/components/ui/IOTableCell";
import { useExperimentItemsTableData } from "../../hooks/useExperimentItemsTableData";
import {
  type ExperimentItemsTableRow,
  type ExperimentItemsTableProps,
} from "./types";
import { formatIntervalSeconds } from "@/src/utils/dates";
import {
  type DataTablePeekViewProps,
  TablePeekView,
} from "@/src/components/table/peek";
import TableLink from "@/src/components/table/table-link";

/**
 * ExperimentItemsTable displays items within a single experiment.
 * Each row represents one experiment item (a single trace execution against a dataset item).
 *
 * Features:
 * - Peek view for traces
 * - Score columns (TODO: add)
 * - I/O cells for input/output/expected output
 * - Sidebar filters for scores (TODO: add) and metadata
 */
export default function ExperimentItemsTable({
  projectId,
  experimentId,
  hideControls = false,
}: ExperimentItemsTableProps) {
  const { setDetailPageList } = useDetailPageLists();
  const [selectedRows, setSelectedRows] = useState<RowSelectionState>({});

  const { selectAll, setSelectAll } = useSelectAll(
    projectId,
    "experiment-items",
  );

  const [paginationState, setPaginationState] = usePaginationState(1, 50);

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(
    "experiment-items",
    "s",
  );

  const [orderByState, setOrderByState] = useOrderByState({
    column: "startTime",
    order: "DESC",
  });

  const queryFilter = useSidebarFilterState(
    experimentItemsFilterConfig,
    {},
    projectId,
    hideControls,
  );

  // Create ref-based wrapper to avoid stale closure when queryFilter updates
  const queryFilterRef = useRef(queryFilter);
  queryFilterRef.current = queryFilter;

  const setFiltersWrapper = useCallback(
    (filters: FilterState) => queryFilterRef.current?.setFilterState(filters),
    [],
  );

  const combinedFilterState = queryFilter.filterState;

  // Use the custom hook for experiment items data fetching
  const { items, totalCount, dataUpdatedAt } = useExperimentItemsTableData({
    projectId,
    experimentId,
    filterState: combinedFilterState,
    orderByState,
    paginationState,
  });

  useEffect(() => {
    if (items.status === "success") {
      setDetailPageList(
        "experiment-items",
        items?.rows?.map((item) => ({
          id: item?.id,
          params: {
            traceId: item?.traceId || "",
            ...(item?.startTime
              ? { timestamp: item?.startTime.toISOString() }
              : {}),
          },
        })) ?? [],
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.status, items.rows]);

  const { selectActionColumn } = TableSelectionManager<ExperimentItemsTableRow>(
    {
      projectId,
      tableName: "experiment-items",
      setSelectedRows,
    },
  );

  const columns: LangfuseColumnDef<ExperimentItemsTableRow>[] = [
    ...(hideControls ? [] : [selectActionColumn]),
    {
      accessorKey: "id",
      id: "id",
      header: getExperimentItemsColumnName("id"),
      size: 150,
      defaultHidden: true,
      enableHiding: true,
      cell: ({ row }) => {
        const experimentItemId = row.original.id;
        const experimentDatasetId = row.original.datasetId;
        const version = row.original.datasetItemVersion;
        return experimentDatasetId ? (
          <TableLink
            path={`/project/${projectId}/datasets/${encodeURIComponent(experimentDatasetId)}/items/${encodeURIComponent(experimentItemId)}${version ? `?version=${encodeURIComponent(version.toISOString())}` : ""}`}
            value={experimentItemId}
          />
        ) : (
          <TableIdOrName value={experimentItemId} />
        );
      },
    },
    {
      accessorKey: "startTime",
      id: "startTime",
      header: getExperimentItemsColumnName("startTime"),
      size: 150,
      enableHiding: true,
      enableSorting: true,
      cell: ({ row }) => {
        const value: Date = row.getValue("startTime");
        return <LocalIsoDate date={value} />;
      },
    },
    {
      accessorKey: "level",
      id: "level",
      header: getExperimentItemsColumnName("level"),
      size: 100,
      enableHiding: true,
      cell: ({ row }) => {
        const value: string = row.getValue("level");
        return <span>{value}</span>;
      },
    },
    {
      accessorKey: "latencyMs",
      id: "latencyMs",
      header: getExperimentItemsColumnName("latencyMs"),
      size: 100,
      enableHiding: true,
      cell: ({ row }) => {
        const value: number | undefined | null = row.getValue("latencyMs");
        if (value === undefined || value === null) return "-";
        // latencyMs is in milliseconds, convert to seconds for display
        return <span>{formatIntervalSeconds(value / 1000)}</span>;
      },
    },
    {
      accessorKey: "totalCost",
      id: "totalCost",
      header: getExperimentItemsColumnName("totalCost"),
      size: 100,
      enableHiding: true,
      cell: ({ row }) => {
        const value: number | undefined | null = row.getValue("totalCost");
        if (value === undefined || value === null) return "-";
        return <span>{usdFormatter(value)}</span>;
      },
    },
    {
      accessorKey: "input",
      header: "Input",
      id: "input",
      size: 300,
      enableHiding: true,
      cell: ({ row }) => {
        const value: string | undefined = row.getValue("input");
        return value ? (
          <MemoizedIOTableCell
            isLoading={false}
            data={value}
            singleLine={rowHeight === "s"}
          />
        ) : null;
      },
    },
    {
      accessorKey: "output",
      id: "output",
      header: "Output",
      size: 300,
      enableHiding: true,
      cell: ({ row }) => {
        const value: string | undefined = row.getValue("output");
        return value ? (
          <MemoizedIOTableCell
            isLoading={false}
            data={value}
            singleLine={rowHeight === "s"}
            className="bg-accent-light-green"
          />
        ) : null;
      },
    },
    {
      accessorKey: "expectedOutput",
      id: "expectedOutput",
      header: "Expected Output",
      size: 300,
      enableHiding: true,
      cell: ({ row }) => {
        const value: string | undefined = row.getValue("expectedOutput");
        return value ? (
          <MemoizedIOTableCell
            isLoading={false}
            data={value}
            singleLine={rowHeight === "s"}
            className="bg-accent-light-blue"
          />
        ) : null;
      },
    },
    {
      accessorKey: "metadata",
      id: "metadata",
      header: "Metadata",
      size: 300,
      enableHiding: true,
      cell: ({ row }) => {
        const value: Record<string, string> = row.getValue("metadata");
        return <IOTableCell data={value} singleLine={rowHeight === "s"} />;
      },
    },
  ];

  const [columnVisibility, setColumnVisibilityState] =
    useColumnVisibility<ExperimentItemsTableRow>(
      `experimentItemsColumnVisibility-${projectId}`,
      columns,
    );

  const [columnOrder, setColumnOrder] = useColumnOrder<ExperimentItemsTableRow>(
    `experimentItemsColumnOrder-${projectId}`,
    columns,
  );

  const peekNavigationProps = usePeekNavigation({
    queryParams: ["observation", "display", "timestamp", "traceId"],
    paramsToMirrorPeekValue: ["observation"],
    extractParamsValuesFromRow: (row: ExperimentItemsTableRow) => ({
      traceId: row.traceId || "",
      timestamp: row.startTime?.toISOString() || "",
    }),
    expandConfig: {
      basePath: `/project/${projectId}/traces`,
      pathParam: "traceId",
    },
  });

  const { isLoading: isViewLoading, ...viewControllers } = useTableViewManager({
    tableName: TableViewPresetTableName.ExperimentItems,
    projectId,
    stateUpdaters: {
      setOrderBy: setOrderByState,
      setFilters: setFiltersWrapper,
      setColumnOrder: setColumnOrder,
      setColumnVisibility: setColumnVisibilityState,
    },
    validationContext: {
      columns,
      filterColumnDefinition: experimentItemsFilterConfig.columnDefinitions,
    },
    currentFilterState: queryFilter.filterState,
  });

  const peekConfig: DataTablePeekViewProps | undefined = useMemo(() => {
    if (hideControls) return undefined;
    return {
      itemType: "TRACE",
      customTitlePrefix: "Experiment Item:",
      detailNavigationKey: "experiment-items",
      children: <PeekViewObservationDetail projectId={projectId} />,
      ...peekNavigationProps,
    };
  }, [projectId, peekNavigationProps, hideControls]);

  const rows: ExperimentItemsTableRow[] = useMemo(() => {
    return items.status === "success" && items.rows ? items.rows : [];
  }, [items]);

  return (
    <DataTableControlsProvider
      tableName={experimentItemsFilterConfig.tableName}
    >
      <div className="flex h-full w-full flex-col">
        {/* Toolbar spanning full width */}
        {!hideControls && (
          <DataTableToolbar
            columns={columns}
            filterState={queryFilter.filterState}
            viewConfig={{
              tableName: TableViewPresetTableName.ExperimentItems,
              projectId,
              controllers: viewControllers,
            }}
            columnsWithCustomSelect={["datasetItemId"]}
            columnVisibility={columnVisibility}
            setColumnVisibility={setColumnVisibilityState}
            columnOrder={columnOrder}
            setColumnOrder={setColumnOrder}
            orderByState={orderByState}
            rowHeight={rowHeight}
            setRowHeight={setRowHeight}
            multiSelect={{
              selectAll,
              setSelectAll,
              selectedRowIds:
                Object.keys(selectedRows).filter((itemId) =>
                  items.rows?.map((item) => item.id).includes(itemId),
                ) ?? [],
              setRowSelection: setSelectedRows,
              totalCount,
              pageSize: paginationState.limit,
              pageIndex: paginationState.page - 1,
            }}
          />
        )}

        {/* Content area with sidebar and table */}
        <ResizableFilterLayout>
          {!hideControls && <DataTableControls queryFilter={queryFilter} />}

          <div className="flex flex-1 flex-col overflow-hidden">
            <DataTable
              key={`experiment-items-table-${dataUpdatedAt}`}
              tableName={"experiment-items"}
              columns={columns}
              peekView={peekConfig}
              data={
                items.status === "loading" || isViewLoading
                  ? { isLoading: true, isError: false }
                  : items.status === "error"
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
            />
          </div>
        </ResizableFilterLayout>

        {/* Peek view panel */}
        {peekConfig && <TablePeekView peekView={peekConfig} />}
      </div>
    </DataTableControlsProvider>
  );
}
