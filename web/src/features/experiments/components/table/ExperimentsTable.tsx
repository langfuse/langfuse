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
  getExperimentsFilterConfig,
  getExperimentsColumnName,
  isExperimentsOmittableFilterColumn,
} from "./filter-config";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import {
  type FilterState,
  TableViewPresetTableName,
  BatchExportTableName,
  ActionId,
  BatchActionType,
} from "@langfuse/shared";
import { numberFormatter } from "@/src/utils/numbers";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { toAbsoluteTimeRange } from "@/src/utils/date-range-utils";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { GitCompareArrows, LightbulbIcon } from "lucide-react";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import Link from "next/link";
import { TableActionMenu } from "@/src/features/table/components/TableActionMenu";
import { type TableAction } from "@/src/features/table/types";
import { Badge } from "@/src/components/ui/badge";
import { type RowSelectionState } from "@tanstack/react-table";
import TableIdOrName from "@/src/components/table/table-id";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useTableViewManager } from "@/src/components/table/table-view-presets/hooks/useTableViewManager";
import { useRouter } from "next/router";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import { useScoreColumns } from "@/src/features/scores/hooks/useScoreColumns";
import { scoreFilters } from "@/src/features/scores/lib/scoreColumns";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import {
  IOTableCell,
  MemoizedIOTableCell,
} from "@/src/components/ui/IOTableCell";
import { useExperimentsTableData } from "../../hooks/useExperimentsTableData";
import { type ExperimentsTableRow, type ExperimentsTableProps } from "./types";
import { useExperimentFilterOptions } from "../../hooks/useExperimentFilterOptions";
import { RunEvaluationDialog } from "@/src/features/batch-actions/components/RunEvaluationDialog";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

export default function ExperimentsTable({
  projectId,
  defaultFilter,
  fixedFilter = [],
  sessionFilterContextId,
}: ExperimentsTableProps) {
  const router = useRouter();
  const filterConfig = useMemo(
    () =>
      getExperimentsFilterConfig(
        fixedFilter
          .map((filter) => filter.column)
          .filter(isExperimentsOmittableFilterColumn),
      ),
    [fixedFilter],
  );

  const { setDetailPageList } = useDetailPageLists();
  const [selectedRows, setSelectedRows] = useState<RowSelectionState>({});
  const [showRunEvaluationDialog, setShowRunEvaluationDialog] = useState(false);

  const hasEvalAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:CUD",
  });

  const [paginationState, setPaginationState] = usePaginationState(1, 50);

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(
    "experiments",
    "s",
  );

  const [inputFilterState] = useQueryFilterState([], "experiments", projectId);

  const [orderByState, setOrderByState] = useOrderByState({
    column: "startTime",
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
          column: "startTime",
          type: "datetime",
          operator: ">=",
          value: tableDateRange.from,
        },
        ...(tableDateRange.to
          ? [
              {
                column: "startTime",
                type: "datetime",
                operator: "<=",
                value: tableDateRange.to,
              } as const,
            ]
          : []),
      ]
    : [];

  const oldFilterState = inputFilterState.concat(dateRangeFilter, fixedFilter);

  // Fetch filter options for datasets and scores
  const { filterOptions, isFilterOptionsPending } = useExperimentFilterOptions({
    projectId,
    oldFilterState,
  });

  const queryFilter = useSidebarFilterState(filterConfig, filterOptions, {
    loading: isFilterOptionsPending,
    stateLocation: "urlAndSessionStorage",
    sessionFilterContextId,
  });

  // Apply default filter on mount (only if no existing filter)
  const hasAppliedDefaultFilter = useRef(false);
  useEffect(() => {
    if (
      defaultFilter &&
      defaultFilter.length > 0 &&
      !hasAppliedDefaultFilter.current
    ) {
      hasAppliedDefaultFilter.current = true;
      queryFilter.setFilterState(defaultFilter);
    }
  }, [defaultFilter, queryFilter]);

  // Create ref-based wrapper to avoid stale closure when queryFilter updates
  const queryFilterRef = useRef(queryFilter);
  queryFilterRef.current = queryFilter;

  const setFiltersWrapper = useCallback(
    (filters: FilterState) => queryFilterRef.current?.setFilterState(filters),
    [],
  );

  const combinedFilterState = queryFilter.filterState.concat(
    dateRangeFilter,
    fixedFilter,
  );

  const filterState = combinedFilterState;

  // Use the custom hook for experiments data fetching
  const { experiments, totalCount, dataUpdatedAt } = useExperimentsTableData({
    projectId,
    filterState,
    orderByState,
    paginationState,
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

  // Trace-level item scores (scores on traces, observation_id IS NULL)
  const {
    scoreColumns: traceItemScoreColumns,
    isLoading: isTraceItemScoreLoading,
  } = useScoreColumns<ExperimentsTableRow>({
    rawKey: true,
    displayFormat: "aggregate",
    scoreColumnKey: "traceItemScores",
    projectId,
    filter:
      experiments.rows && experiments.rows.length > 0
        ? scoreFilters.forExperimentItems({
            experimentIds: experiments.rows.map((e) => e.id),
          })
        : [],
    prefix: "Trace",
    isFilterDataPending: experiments.status === "loading",
    defaultHidden: true,
  });

  // Observation-level item scores (scores on observations, observation_id IS NOT NULL)
  const {
    scoreColumns: observationItemScoreColumns,
    isLoading: isObservationItemScoreLoading,
  } = useScoreColumns<ExperimentsTableRow>({
    rawKey: true,
    displayFormat: "aggregate",
    scoreColumnKey: "observationItemScores",
    projectId,
    filter:
      experiments.rows && experiments.rows.length > 0
        ? scoreFilters.forExperimentItems({
            experimentIds: experiments.rows.map((e) => e.id),
          })
        : [],
    isFilterDataPending: experiments.status === "loading",
  });

  // Experiment-level scores (direct dataset_run_id match)
  const {
    scoreColumns: experimentScoreColumns,
    isLoading: isExperimentScoreColumnLoading,
  } = useScoreColumns<ExperimentsTableRow>({
    scoreColumnKey: "experimentScores",
    projectId,
    filter:
      experiments.rows && experiments.rows.length > 0
        ? scoreFilters.forDatasetRuns({
            datasetRunIds: experiments.rows.map((e) => e.id),
          })
        : [],
    rawKey: true,
    prefix: "Experiment",
    isFilterDataPending: experiments.status === "loading",
  });

  const { selectActionColumn } = TableSelectionManager<ExperimentsTableRow>({
    projectId,
    tableName: "experiments",
    setSelectedRows,
  });

  const columns: LangfuseColumnDef<ExperimentsTableRow>[] = [
    selectActionColumn,
    {
      accessorKey: "name",
      id: "name",
      header: getExperimentsColumnName("name"),
      size: 200,
      isPinnedLeft: true,
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
      accessorKey: "startTime",
      id: "startTime",
      header: getExperimentsColumnName("startTime"),
      size: 150,
      enableHiding: true,
      enableSorting: true,
      cell: ({ row }) => {
        const value: Date = row.getValue("startTime");
        return <LocalIsoDate date={value} />;
      },
    },
    {
      accessorKey: "datasetId",
      id: "datasetId",
      header: getExperimentsColumnName("experimentDatasetId"),
      size: 150,
      cell: ({ row }) => {
        const datasetId: string | undefined = row.getValue("datasetId");
        const datasetName = filterOptions.experimentDatasetId?.find(
          (d) => d.value === datasetId,
        )?.displayValue;

        if (!datasetId || !datasetName) {
          return undefined;
        }

        return (
          <Link
            href={`/project/${projectId}/datasets/${encodeURIComponent(datasetId)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Badge
              variant="secondary"
              className="hover:bg-secondary/80 max-w-full cursor-pointer"
            >
              {datasetName}
            </Badge>
          </Link>
        );
      },
    },
    {
      accessorKey: "prompts",
      id: "prompts",
      header: getExperimentsColumnName("prompts"),
      size: 100,
      enableHiding: true,
      cell: ({ row }) => {
        const value: Array<[string, number | null]> = row.getValue("prompts");
        return (
          <div
            className={
              rowHeight === "s"
                ? "flex max-w-full flex-nowrap gap-1 overflow-x-auto py-0.5 whitespace-nowrap"
                : "flex flex-wrap gap-1"
            }
          >
            {value.map(([name, version]) => (
              <Link
                key={`${name}-${version}`}
                href={`/project/${projectId}/prompts/${encodeURIComponent(name)}?version=${version}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0"
              >
                <Badge
                  variant="secondary"
                  className="hover:bg-secondary/80 cursor-pointer"
                >
                  {name}
                </Badge>
              </Link>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: "latencyAvg",
      id: "latencyAvg",
      header: getExperimentsColumnName("latencyAvg"),
      size: 100,
      enableHiding: true,
      headerTooltip: {
        description: "Average duration of the root span per experiment item.",
      },
      cell: ({ row }) => {
        const value: number | undefined = row.getValue("latencyAvg");
        if (value === undefined || value === null) return undefined;
        return <span>{numberFormatter(value / 1000, 4)}s</span>;
      },
    },
    {
      accessorKey: "totalCost",
      id: "totalCost",
      header: getExperimentsColumnName("totalCost"),
      size: 100,
      enableHiding: true,
      cell: ({ row }) => {
        const value: number | undefined = row.getValue("totalCost");
        if (value === undefined || value === null) return undefined;
        return <span>${numberFormatter(value, 6)}</span>;
      },
    },
    {
      accessorKey: "traceItemScores",
      header: "Trace Item Scores",
      id: "traceItemScores",
      enableHiding: true,
      defaultHidden: true,
      cell: () => {
        return isTraceItemScoreLoading ? (
          <Skeleton className="h-3 w-1/2" />
        ) : null;
      },
      columns: traceItemScoreColumns,
    },
    {
      accessorKey: "observationItemScores",
      header: "Observation Item Scores",
      id: "observationItemScores",
      enableHiding: true,
      defaultHidden: true,
      cell: () => {
        return isObservationItemScoreLoading ? (
          <Skeleton className="h-3 w-1/2" />
        ) : null;
      },
      columns: observationItemScoreColumns,
    },
    {
      accessorKey: "experimentScores",
      header: "Experiment-Level Scores",
      id: "experimentScores",
      enableHiding: true,
      defaultHidden: true,
      cell: () => {
        return isExperimentScoreColumnLoading ? (
          <Skeleton className="h-3 w-1/2" />
        ) : null;
      },
      columns: experimentScoreColumns,
    },
    {
      accessorKey: "metadata",
      id: "metadata",
      header: getExperimentsColumnName("metadata"),
      size: 100,
      enableHiding: true,
      cell: ({ row }) => {
        const value: Record<string, string> = row.getValue("metadata");
        return <IOTableCell data={value} singleLine={rowHeight === "s"} />;
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
    tableName: TableViewPresetTableName.Experiments,
    projectId,
    stateUpdaters: {
      setOrderBy: setOrderByState,
      setFilters: setFiltersWrapper,
      setColumnOrder: setColumnOrder,
      setColumnVisibility: setColumnVisibilityState,
    },
    validationContext: {
      columns,
      filterColumnDefinition: filterConfig.columnDefinitions,
    },
    currentFilterState: queryFilter.filterState,
  });

  const rows: ExperimentsTableRow[] = useMemo(() => {
    return experiments.status === "success" && experiments.rows
      ? experiments.rows
      : [];
  }, [experiments]);

  // Get selected experiment IDs in the order they appear in the table
  const selectedExperimentIds = useMemo(() => {
    const selectedIds = Object.keys(selectedRows).filter((id) =>
      rows.some((row) => row.id === id),
    );
    // Sort by table order to ensure first selected = first in table among selected
    return rows
      .filter((row) => selectedIds.includes(row.id))
      .map((row) => row.id);
  }, [selectedRows, rows]);

  // Build query with experiment context filter for batch actions
  const batchActionQuery = useMemo(
    () => ({
      filter:
        selectedExperimentIds.length > 0
          ? [
              {
                column: "experimentId" as const,
                operator: "any of" as const,
                value: selectedExperimentIds,
                type: "stringOptions" as const,
              },
              {
                column: "isExperimentItemRootSpan" as const,
                operator: "=" as const,
                value: true,
                type: "boolean" as const,
              },
            ]
          : [],
      orderBy: { column: "startTime" as const, order: "DESC" as const },
    }),
    [selectedExperimentIds],
  );

  // Handler for comparing selected experiments
  // First selected becomes baseline, rest become comparisons
  const handleCompareSelected = useCallback(() => {
    if (selectedExperimentIds.length === 0) return;

    const [baseline, ...comparisons] = selectedExperimentIds;
    const params = new URLSearchParams();
    params.set("baseline", baseline);
    comparisons.forEach((id) => {
      params.append("c", id);
    });

    void router.push(
      `/project/${projectId}/experiments/results?${params.toString()}`,
    );
  }, [selectedExperimentIds, projectId, router]);

  // Build table actions - Compare is disabled (not hidden) when >5 rows selected
  const tableActions: TableAction[] = useMemo(() => {
    const actions: TableAction[] = [];

    // Compare action: disabled when >5 experiments selected
    const tooManySelected = selectedExperimentIds.length > 5;
    actions.push({
      id: ActionId.ExperimentCompare,
      type: BatchActionType.Create,
      label: "Compare",
      description: "Compare selected experiments",
      icon: <GitCompareArrows className="mr-2 h-4 w-4" />,
      customDialog: true,
      disabled: tooManySelected,
      disabledReason: tooManySelected
        ? "Select only up to 5 experiments to compare"
        : undefined,
      accessCheck: {
        scope: "project:read",
      },
    } as TableAction);

    // Run Evaluator action: only when user has eval access
    if (hasEvalAccess) {
      actions.push({
        id: ActionId.ObservationBatchEvaluation,
        type: BatchActionType.Create,
        label: "Run Evaluator",
        description: "Run evaluators on selected experiments",
        icon: <LightbulbIcon className="mr-2 h-4 w-4" />,
        customDialog: true,
        accessCheck: {
          scope: "evalJob:CUD",
        },
      } as TableAction);
    }

    return actions;
  }, [selectedExperimentIds.length, hasEvalAccess]);

  const shouldShowActions =
    selectedExperimentIds.length > 0 && tableActions.length > 0;

  return (
    <>
      <DataTableControlsProvider>
        <div className="flex h-full w-full flex-col">
          {/* Toolbar spanning full width */}
          <DataTableToolbar
            columns={columns}
            filterState={queryFilter.filterState}
            viewConfig={{
              tableName: TableViewPresetTableName.Experiments,
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
            multiSelect={{
              selectAll: false,
              setSelectAll: () => {},
              totalCount,
              selectedRowIds:
                Object.keys(selectedRows).filter((experimentId) =>
                  experiments.rows?.map((e) => e.id).includes(experimentId),
                ) ?? [],
              setRowSelection: setSelectedRows,
              pageSize: paginationState.limit,
              pageIndex: paginationState.page - 1,
            }}
            actionButtons={
              shouldShowActions
                ? [
                    <TableActionMenu
                      key="experiments-multi-select-actions"
                      projectId={projectId}
                      actions={tableActions}
                      tableName={BatchExportTableName.Sessions}
                      onCustomAction={(actionId) => {
                        if (actionId === ActionId.ExperimentCompare) {
                          handleCompareSelected();
                        } else if (
                          actionId === ActionId.ObservationBatchEvaluation
                        ) {
                          setShowRunEvaluationDialog(true);
                        }
                      }}
                    />,
                  ]
                : undefined
            }
          />

          {/* Content area with sidebar and table */}
          <ResizableFilterLayout>
            <DataTableControls queryFilter={queryFilter} />

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
                    const experimentUrl = `/project/${projectId}/experiments/results?baseline=${encodeURIComponent(experimentId)}`;
                    const fullUrl = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${experimentUrl}`;
                    window.open(fullUrl, "_blank");
                  }
                  // For normal clicks, navigate to experiment detail page
                  else {
                    void router.push(
                      `/project/${projectId}/experiments/results?baseline=${encodeURIComponent(row.id)}`,
                    );
                  }
                }}
              />
            </div>
          </ResizableFilterLayout>
        </div>
      </DataTableControlsProvider>

      {showRunEvaluationDialog && selectedExperimentIds.length > 0 && (
        <RunEvaluationDialog
          projectId={projectId}
          selectedObservationIds={[]}
          query={batchActionQuery}
          selectAll={true}
          totalCount={selectedExperimentIds.length}
          onClose={() => {
            setShowRunEvaluationDialog(false);
            setSelectedRows({});
          }}
          sourceTable="experiments"
        />
      )}
    </>
  );
}
