import { useExperimentResultsState } from "@/src/features/experiments/hooks/useExperimentResultsState";
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
import {
  type FilterState,
  type FilterCondition,
  TableViewPresetTableName,
} from "@langfuse/shared";
import { ExperimentFilterPills } from "./ExperimentFilterPills";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { type RowSelectionState } from "@tanstack/react-table";
import TableIdOrName from "@/src/components/table/table-id";
import { PeekViewObservationDetail } from "@/src/components/table/peek/peek-observation-detail";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useTableViewManager } from "@/src/components/table/table-view-presets/hooks/useTableViewManager";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import { useSelectAll } from "@/src/features/table/hooks/useSelectAll";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { useExperimentItemsTableData } from "../../hooks/useExperimentItemsTableData";
import {
  type ExperimentItemsTableRow,
  type ExperimentItemsTableProps,
  type ExperimentItemData,
  type ExperimentOutputData,
} from "./types";
import { MemoizedIOTableCell } from "@/src/components/ui/IOTableCell";
import {
  type DataTablePeekViewProps,
  TablePeekView,
} from "@/src/components/table/peek";
import TableLink from "@/src/components/table/table-link";
import { cn } from "@/src/utils/tailwind";
import { useScoreColumns } from "@/src/features/scores/hooks/useScoreColumns";
import { scoreFilters } from "@/src/features/scores/lib/scoreColumns";
import { Skeleton } from "@/src/components/ui/skeleton";
import { ExperimentDisplaySettings } from "@/src/features/experiments/components/ExperimentDisplaySettings";

// Font color palette for experiment rows within a cell
const EXPERIMENT_TEXT_COLORS = [
  "text-dark-gray", // Base experiment - default color
  "text-dark-green", // Comparison 1
  "text-dark-blue", // Comparison 2
  "text-dark-yellow", // Comparison 3
  "text-purple-700", // Comparison 4
  "text-pink-700", // Comparison 5
];

/**
 * Get the text color class for an experiment based on its index in the allExperimentIds array.
 */
const getExperimentTextColor = (
  experimentId: string,
  allExperimentIds: string[],
): string => {
  const index = allExperimentIds.indexOf(experimentId);
  return EXPERIMENT_TEXT_COLORS[index % EXPERIMENT_TEXT_COLORS.length];
};

/**
 * Cell component that renders stacked values for each experiment.
 */
const StackedExperimentCell = ({
  experiments,
  allExperimentIds,
  renderValue,
  className,
}: {
  experiments: ExperimentItemData[];
  allExperimentIds: string[];
  renderValue: (exp: ExperimentItemData) => React.ReactNode;
  className?: string;
}) => {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      {experiments.map((exp) => (
        <div
          key={exp.experimentId}
          className={cn(
            "px-1 py-0.5",
            getExperimentTextColor(exp.experimentId, allExperimentIds),
          )}
        >
          {renderValue(exp)}
        </div>
      ))}
    </div>
  );
};

/**
 * Cell component that renders stacked output values for each experiment.
 */
const StackedOutputCell = ({
  outputs,
  allExperimentIds,
  singleLine,
}: {
  outputs: ExperimentOutputData[];
  allExperimentIds: string[];
  singleLine: boolean;
}) => {
  return (
    <div className="flex flex-col">
      {outputs.map((out) => (
        <div
          key={out.experimentId}
          className={cn(
            "",
            getExperimentTextColor(out.experimentId, allExperimentIds),
          )}
        >
          {out.output ? (
            <MemoizedIOTableCell
              isLoading={false}
              data={out.output}
              singleLine={true}
            />
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </div>
      ))}
    </div>
  );
};

/**
 * ExperimentItemsTable displays items within a single experiment.
 * Each row represents one experiment item (a single trace execution against a dataset item).
 *
 * Features:
 * - Peek view for traces
 * - Score columns
 * - I/O cells for input/output/expected output
 * - Sidebar filters for scores and metadata
 */
export default function ExperimentItemsTable({
  projectId,
  experimentId,
  hideControls = false,
  availableExperiments = [],
}: ExperimentItemsTableProps) {
  const { setDetailPageList } = useDetailPageLists();
  const [selectedRows, setSelectedRows] = useState<RowSelectionState>({});

  const { selectAll, setSelectAll } = useSelectAll(
    projectId,
    "experiment-items",
  );

  const { layout, setLayout, itemVisibility, setItemVisibility } =
    useExperimentResultsState();

  const [paginationState, setPaginationState] = usePaginationState(1, 50);

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(
    "experiment-items",
    "s",
  );

  const [orderByState, setOrderByState] = useOrderByState({
    column: "startTime",
    order: "DESC",
  });

  // Use sidebar filter state for the sidebar UI (provides proper facets, options, etc.)
  // This is the single source of truth for filters
  const queryFilter = useSidebarFilterState(experimentItemsFilterConfig, {});

  // Create ref-based wrapper to avoid stale closure when queryFilter updates
  const queryFilterRef = useRef(queryFilter);
  queryFilterRef.current = queryFilter;

  const setFiltersWrapper = useCallback(
    (filters: FilterState) => queryFilterRef.current?.setFilterState(filters),
    [],
  );

  // Per-experiment filter targeting state (maps filter index to experiment ID)
  // Default: all filters target the baseline experiment
  const [filterTargets, setFilterTargets] = useState<Record<number, string>>(
    {},
  );

  // Build filter list for pills display
  // Group filters by their target experiment (defaults to baseline)
  const filtersByExperiment = useMemo(() => {
    const filterState = queryFilter.filterState;
    if (filterState.length === 0) return [];

    // Group filters by target experiment
    const grouped: Record<string, FilterState> = {};
    filterState.forEach((filter, index) => {
      const targetExp = filterTargets[index] ?? experimentId;
      if (!grouped[targetExp]) {
        grouped[targetExp] = [];
      }
      grouped[targetExp].push(filter);
    });

    // Convert to array format expected by ExperimentFilterPills
    return Object.entries(grouped).map(([runId, filters]) => ({
      runId,
      filters,
    }));
  }, [queryFilter.filterState, filterTargets, experimentId]);

  // Handler for changing filter target experiment
  const handleFilterTargetChange = useCallback(
    (
      _fromExperimentId: string,
      toExperimentId: string,
      _filter: FilterCondition,
      filterIndex: number,
    ) => {
      // Find the original filter index in queryFilter.filterState
      // We need to map from the grouped index back to the original index
      const filterState = queryFilterRef.current.filterState;

      // Count filters up to the current group to find original index
      let originalIndex = 0;
      let currentGroupIndex = 0;

      for (let i = 0; i < filterState.length; i++) {
        const target = filterTargets[i] ?? experimentId;
        if (target === _fromExperimentId) {
          if (currentGroupIndex === filterIndex) {
            originalIndex = i;
            break;
          }
          currentGroupIndex++;
        }
      }

      // Update the target for this filter
      setFilterTargets((prev) => ({
        ...prev,
        [originalIndex]: toExperimentId,
      }));
    },
    [filterTargets, experimentId],
  );

  // Handler for removing a filter via pill
  const handleFilterRemove = useCallback(
    (experimentIdToRemoveFrom: string, filterIndex: number) => {
      const filterState = queryFilterRef.current.filterState;

      // Find the original filter index
      let originalIndex = 0;
      let currentGroupIndex = 0;

      for (let i = 0; i < filterState.length; i++) {
        const target = filterTargets[i] ?? experimentId;
        if (target === experimentIdToRemoveFrom) {
          if (currentGroupIndex === filterIndex) {
            originalIndex = i;
            break;
          }
          currentGroupIndex++;
        }
      }

      // Remove the filter from queryFilter
      const newFilters = filterState.filter((_, idx) => idx !== originalIndex);
      queryFilterRef.current.setFilterState(newFilters);

      // Clean up the filter targets (shift indices down)
      setFilterTargets((prev) => {
        const newTargets: Record<number, string> = {};
        Object.entries(prev).forEach(([key, value]) => {
          const idx = parseInt(key);
          if (idx < originalIndex) {
            newTargets[idx] = value;
          } else if (idx > originalIndex) {
            newTargets[idx - 1] = value;
          }
          // Skip the removed index
        });
        return newTargets;
      });
    },
    [filterTargets, experimentId],
  );

  // Use the custom hook for experiment items data fetching
  const { items, totalCount, dataUpdatedAt, ioLoading } =
    useExperimentItemsTableData({
      projectId,
      baseExperimentId: experimentId,
      compExperimentIds: availableExperiments
        .filter((exp) => exp.id !== experimentId)
        .map((exp) => exp.id),
      filterByExperiment: filtersByExperiment.map((filter) => ({
        experimentId: filter.runId,
        filters: filter.filters,
      })),
      orderByState,
      paginationState,
      itemVisibility,
    });

  useEffect(() => {
    if (items.status === "success") {
      // Use the first experiment's data for detail page navigation
      setDetailPageList(
        "experiment-items",
        items?.rows?.map((item: ExperimentItemsTableRow) => {
          const firstExp = item.experiments[0];
          return {
            id: item.itemId,
            params: {
              traceId: firstExp?.traceId || "",
              ...(firstExp?.startTime
                ? { timestamp: firstExp.startTime.toISOString() }
                : {}),
            },
          };
        }) ?? [],
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

  // All experiment IDs for color coding (base first, then comparisons)
  const allExperimentIds = useMemo(() => {
    return [
      experimentId,
      ...availableExperiments
        .filter((exp) => exp.id !== experimentId)
        .map((exp) => exp.id),
    ];
  }, [experimentId, availableExperiments]);

  const {
    scoreColumns: observationScoreColumns,
    isLoading: isObservationScoreColumnsLoading,
  } = useScoreColumns<ExperimentItemData>({
    scoreColumnKey: "observationScores",
    projectId,
    filter: scoreFilters.forExperimentItems({
      experimentIds: allExperimentIds,
    }),
  });

  const {
    scoreColumns: traceScoreColumns,
    isLoading: isTraceScoreColumnsLoading,
  } = useScoreColumns<ExperimentItemData>({
    scoreColumnKey: "traceScores",
    projectId,
    filter: scoreFilters.forExperimentItems({
      experimentIds: allExperimentIds,
    }),
    prefix: "Trace",
    defaultHidden: true,
  });

  const buildExperimentScoreColumns = (
    scoreColumns: LangfuseColumnDef<ExperimentItemData>[],
    scoreField: "observationScores" | "traceScores",
  ): LangfuseColumnDef<ExperimentItemsTableRow>[] =>
    scoreColumns.map((scoreCol) => ({
      ...scoreCol,
      // Override the cell renderer to show stacked scores for each experiment
      cell: ({ row }: { row: any }) => {
        const experiments = row.original.experiments;
        // todo: fix properly
        const scoreKey = scoreCol.accessorKey?.replace(`Trace-`, "");
        return (
          <StackedExperimentCell
            experiments={experiments}
            allExperimentIds={allExperimentIds}
            renderValue={(exp) => {
              const scoresData = exp[scoreField] ?? {};
              const value = scoresData[scoreKey];

              if (!value)
                return <span className="text-muted-foreground">-</span>;

              const mockRow = {
                getValue: (key: string) =>
                  key === scoreField ? scoresData : undefined,
                original: exp,
              } as any;
              const scoreCell = scoreCol.cell;

              return typeof scoreCell === "function"
                ? scoreCell({
                    row: mockRow,
                    getValue: mockRow.getValue,
                  } as any)
                : null;
            }}
          />
        );
      },
    })) as LangfuseColumnDef<ExperimentItemsTableRow>[];

  const observationExperimentScoreColumns = useMemo(
    () =>
      buildExperimentScoreColumns(observationScoreColumns, "observationScores"),
    [observationScoreColumns, allExperimentIds],
  );

  const traceExperimentScoreColumns = useMemo(
    () => buildExperimentScoreColumns(traceScoreColumns, "traceScores"),
    [traceScoreColumns, allExperimentIds],
  );

  const columns: LangfuseColumnDef<ExperimentItemsTableRow>[] = [
    ...(hideControls ? [] : [selectActionColumn]),
    {
      accessorKey: "itemId",
      id: "itemId",
      header: "Item ID",
      size: 150,
      enableHiding: true,
      cell: ({ row }) => {
        const itemId = row.original.itemId;
        return <TableIdOrName value={itemId} />;
      },
    },
    {
      accessorKey: "experiments",
      id: "traceId",
      header: "Trace ID",
      size: 180,
      enableHiding: true,
      cell: ({ row }) => {
        const experiments = row.original.experiments;
        return (
          <StackedExperimentCell
            experiments={experiments}
            allExperimentIds={allExperimentIds}
            renderValue={(exp) => (
              <TableLink
                path={`/project/${projectId}/traces/${encodeURIComponent(exp.traceId)}`}
                value={exp.traceId}
              />
            )}
          />
        );
      },
    },
    {
      accessorKey: "experiments",
      id: "observationId",
      header: "Observation ID",
      size: 180,
      defaultHidden: true,
      enableHiding: true,
      cell: ({ row }) => {
        const experiments = row.original.experiments;
        return (
          <StackedExperimentCell
            experiments={experiments}
            allExperimentIds={allExperimentIds}
            renderValue={(exp) => <TableIdOrName value={exp.observationId} />}
          />
        );
      },
    },
    {
      accessorKey: "experiments",
      id: "startTime",
      header: getExperimentItemsColumnName("startTime"),
      size: 180,
      enableHiding: true,
      enableSorting: true,
      cell: ({ row }) => {
        const experiments = row.original.experiments;
        return (
          <StackedExperimentCell
            experiments={experiments}
            allExperimentIds={allExperimentIds}
            renderValue={(exp) => <LocalIsoDate date={exp.startTime} />}
          />
        );
      },
    },
    {
      accessorKey: "experiments",
      id: "level",
      header: getExperimentItemsColumnName("level"),
      size: 120,
      enableHiding: true,
      cell: ({ row }) => {
        const experiments = row.original.experiments;
        return (
          <StackedExperimentCell
            experiments={experiments}
            allExperimentIds={allExperimentIds}
            renderValue={(exp) => <span>{exp.level}</span>}
          />
        );
      },
    },
    {
      accessorKey: "experiments",
      id: "experimentId",
      header: "Experiment",
      size: 150,
      enableHiding: true,
      cell: ({ row }) => {
        const experiments = row.original.experiments;
        return (
          <StackedExperimentCell
            experiments={experiments}
            allExperimentIds={allExperimentIds}
            renderValue={(exp) => {
              const expOption = availableExperiments.find(
                (e) => e.id === exp.experimentId,
              );
              return (
                <span className="truncate text-xs">
                  {expOption?.name ?? exp.experimentId.slice(0, 8)}
                </span>
              );
            }}
          />
        );
      },
    },
    {
      accessorKey: "input",
      id: "input",
      header: "Input",
      size: 300,
      enableHiding: true,
      cell: ({ row }) => {
        return (
          <MemoizedIOTableCell
            isLoading={ioLoading}
            data={row.original.input ?? null}
            singleLine={rowHeight === "s"}
          />
        );
      },
    },
    {
      accessorKey: "output",
      id: "output",
      header: "Output",
      size: 300,
      enableHiding: true,
      cell: ({ row }) => {
        const outputs = row.original.outputs ?? [];
        if (ioLoading) {
          return (
            <MemoizedIOTableCell
              isLoading={true}
              data={null}
              singleLine={rowHeight === "s"}
            />
          );
        }
        return (
          <StackedOutputCell
            outputs={outputs}
            allExperimentIds={allExperimentIds}
            singleLine={rowHeight === "s"}
          />
        );
      },
    },
    {
      accessorKey: "expectedOutput",
      id: "expectedOutput",
      header: "Expected Output",
      size: 300,
      enableHiding: true,
      cell: ({ row }) => {
        return (
          <MemoizedIOTableCell
            isLoading={ioLoading}
            data={row.original.expectedOutput ?? null}
            singleLine={rowHeight === "s"}
          />
        );
      },
    },
    {
      accessorKey: "observationScores",
      header: "Observation Scores",
      id: "observationScores",
      enableHiding: true,
      defaultHidden: true,
      cell: () => {
        return isObservationScoreColumnsLoading ? (
          <Skeleton className="h-3 w-1/2" />
        ) : null;
      },
      columns: observationExperimentScoreColumns,
    },
    {
      accessorKey: "traceScores",
      header: "Trace Scores",
      id: "traceScores",
      enableHiding: true,
      defaultHidden: true,
      cell: () => {
        return isTraceScoreColumnsLoading ? (
          <Skeleton className="h-3 w-1/2" />
        ) : null;
      },
      columns: traceExperimentScoreColumns,
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
    extractParamsValuesFromRow: (row: ExperimentItemsTableRow) => {
      // Use the first experiment's data for peek navigation
      const firstExp = row.experiments[0];
      return {
        traceId: firstExp?.traceId || "",
        timestamp: firstExp?.startTime?.toISOString() || "",
      };
    },
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
                  items.rows
                    ?.map((item: ExperimentItemsTableRow) => item.itemId)
                    .includes(itemId),
                ) ?? [],
              setRowSelection: setSelectedRows,
              totalCount,
              pageSize: paginationState.limit,
              pageIndex: paginationState.page - 1,
            }}
            actionButtons={[
              <ExperimentDisplaySettings
                layout={layout}
                onLayoutChange={setLayout}
                itemVisibility={itemVisibility}
                onItemVisibilityChange={setItemVisibility}
              />,
            ]}
          />
        )}

        {/* Filter Pills with Experiment Targeting */}
        {filtersByExperiment.length > 0 && availableExperiments.length > 0 && (
          <ExperimentFilterPills
            projectId={projectId}
            filtersByExperiment={filtersByExperiment}
            availableExperiments={availableExperiments}
            onFilterTargetChange={handleFilterTargetChange}
            onFilterRemove={handleFilterRemove}
            className="border-b"
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
