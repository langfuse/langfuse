import { MAX_SELECTED_EXPERIMENTS } from "@/src/features/experiments/constants/comparison";
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
import { TableHeaderControls } from "@/src/components/table/table-header-controls";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { GitCompareArrows, LightbulbIcon } from "lucide-react";
import { createDateTableColumn } from "@/src/components/design-system/Table/columns/createDateTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/Table/columns/createNumberTableColumn";
import Link from "next/link";
import { TableActionMenu } from "@/src/features/table/components/TableActionMenu";
import { type TableAction } from "@/src/features/table/types";
import { Badge } from "@/src/components/ui/badge";
import { type VisibilityState } from "@tanstack/react-table";
import { useStore } from "zustand";
import TableIdOrName from "@/src/components/table/table-id";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useTableViewManager } from "@/src/components/table/table-view-presets/hooks/useTableViewManager";
import { useRouter } from "next/router";
import { StringParam, useQueryParam, withDefault } from "use-query-params";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import { useScoreColumns } from "@/src/features/scores/hooks/useScoreColumns";
import {
  collectPresentScoreKeys,
  revealScoreColumns,
  scoreFilters,
} from "@/src/features/scores/lib/scoreColumns";
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
import { ExperimentMetricStrip } from "../ExperimentMetricStrip";
import { useExperimentComparisonAnalytics } from "@/src/features/experiments/hooks/useExperimentComparisonAnalytics";
import {
  useScoreColumnScopeAnalytics,
  type ScoreColumnGroupScopes,
} from "@/src/features/experiments/hooks/useScoreColumnScopeAnalytics";
import {
  createExperimentsTableStore,
  type ExperimentsTableStore,
} from "@/src/features/experiments/store/experimentsTableStore";
import { useExperimentsTableSelectionSync } from "@/src/features/experiments/hooks/useExperimentsTableSelectionSync";
import { NotRecordedMetric } from "./NotRecordedMetric";

/**
 * LFE-10460: the metadata column's default position moved from last to right
 * after `description`. Both persistence paths (localStorage replay and saved
 * table views) snapshot the pre-PR order with metadata trailing, so this pure
 * transform repositions it to its new default slot ONLY when it is currently
 * the last column (the stale pre-PR default). If a user has manually moved
 * metadata anywhere else, their layout is left untouched.
 *
 * Reused as both the one-time `useColumnOrder` migration (localStorage path)
 * and the `migrateColumnOrder` transform on saved-view payloads.
 */
const repositionTrailingMetadata = (order: string[]): string[] => {
  const lastIndex = order.length - 1;
  // Only act on the stale default: metadata sitting as the last column.
  if (order[lastIndex] !== "metadata") return order;
  // New default slot: immediately after the `description` column, matching the
  // JS column definition (select, name, description, metadata...).
  const descriptionIndex = order.indexOf("description");
  const targetIndex = descriptionIndex === -1 ? 0 : descriptionIndex + 1;
  if (targetIndex === lastIndex) return order; // already in place
  const next = [...order];
  next.splice(lastIndex, 1); // remove trailing metadata
  next.splice(targetIndex, 0, "metadata"); // insert at new default slot
  return next;
};

/** The table's score column groups, by the score level each one holds. */
const SCORE_COLUMN_GROUP_SCOPES: ScoreColumnGroupScopes = {
  traceItemScores: "trace",
  observationItemScores: "observation",
  experimentScores: "experiment",
};

/**
 * Owns every consumer of the selection state (action menu, compare navigation,
 * run-evaluator dialog) so checkbox clicks re-render only this menu and the
 * clicked checkbox — not the whole ExperimentsTable.
 */
function ExperimentsMultiSelectActionMenu({
  projectId,
  store,
}: {
  projectId: string;
  store: ExperimentsTableStore;
}) {
  const router = useRouter();
  const [showRunEvaluationDialog, setShowRunEvaluationDialog] = useState(false);
  const { captureComparisonChanged } = useExperimentComparisonAnalytics({
    projectId,
  });
  // Page-scoped and in table order, so the first id is the topmost selected
  // row — the compare baseline.
  const selectedExperimentIds = useStore(
    store,
    (state) => state.selectedPageRowIds,
  );
  const clearSelection = useStore(
    store,
    (state) => state.actions.clearSelection,
  );

  const hasEvalAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:CUD",
  });

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
  const handleCompareSelected = () => {
    if (selectedExperimentIds.length === 0) return;

    const [baseline, ...comparisons] = selectedExperimentIds;
    // The list's own way into a comparison — the same event the picker emits,
    // told apart by its source. (LFE-15720)
    captureComparisonChanged({
      baselineId: baseline,
      comparisonIds: comparisons,
      source: "table_selection",
    });
    const params = new URLSearchParams();
    params.set("baseline", baseline);
    comparisons.forEach((id) => {
      params.append("c", id);
    });

    router.push(
      `/project/${projectId}/experiments/results?${params.toString()}`,
    );
  };

  if (selectedExperimentIds.length === 0) return null;

  // Build table actions - Compare is disabled (not hidden) when >MAX_SELECTED_EXPERIMENTS rows selected
  const tooManySelected =
    selectedExperimentIds.length > MAX_SELECTED_EXPERIMENTS;
  const tableActions: TableAction[] = [
    {
      id: ActionId.ExperimentCompare,
      type: BatchActionType.Create,
      label: "Compare",
      description: "Compare selected experiments",
      icon: <GitCompareArrows className="h-4 w-4 sm:mr-2" />,
      customDialog: true,
      disabled: tooManySelected,
      disabledReason: tooManySelected
        ? `Select only up to ${MAX_SELECTED_EXPERIMENTS} experiments to compare`
        : undefined,
      accessCheck: {
        scope: "project:read",
      },
    } as TableAction,
    ...(hasEvalAccess
      ? [
          {
            id: ActionId.ObservationBatchEvaluation,
            type: BatchActionType.Create,
            label: "Run Evaluator",
            description: "Run evaluators on selected experiments",
            icon: <LightbulbIcon className="h-4 w-4 sm:mr-2" />,
            customDialog: true,
            accessCheck: {
              scope: "evalJob:CUD",
            },
          } as TableAction,
        ]
      : []),
  ];

  return (
    <>
      <TableActionMenu
        projectId={projectId}
        actions={tableActions}
        tableName={BatchExportTableName.Sessions}
        selectedCount={selectedExperimentIds.length}
        onClearSelection={clearSelection}
        onCustomAction={(actionId) => {
          if (actionId === ActionId.ExperimentCompare) {
            handleCompareSelected();
          } else if (actionId === ActionId.ObservationBatchEvaluation) {
            setShowRunEvaluationDialog(true);
          }
        }}
      />
      {showRunEvaluationDialog && (
        <RunEvaluationDialog
          projectId={projectId}
          selectedObservationIds={[]}
          query={batchActionQuery}
          selectAll={true}
          totalCount={selectedExperimentIds.length}
          onClose={() => {
            setShowRunEvaluationDialog(false);
            clearSelection();
          }}
          sourceTable="experiments"
        />
      )}
    </>
  );
}

export default function ExperimentsTable({
  projectId,
  defaultFilter,
  fixedFilter = [],
  sessionFilterContextId,
  showControlsInPageHeader = false,
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
  // Selection lives in a per-mount vanilla zustand store (not useState) so a
  // checkbox click re-renders only its subscribers, not the whole table.
  const [experimentsTableStore] = useState(() => createExperimentsTableStore());

  const [paginationState, setPaginationState] = usePaginationState(1, 50);

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(
    "experiments",
    "s",
  );

  const [searchQuery, setSearchQuery] = useQueryParam(
    "search",
    withDefault(StringParam, null),
  );

  // A match on the experiment's name, expressed as a filter because the
  // experiments query takes a FilterState and has no search input of its own.
  const searchFilter: FilterState = useMemo(() => {
    const query = searchQuery?.trim();
    return query
      ? [{ column: "name", type: "string", operator: "contains", value: query }]
      : [];
  }, [searchQuery]);

  const submitSearch = useCallback(
    (query: string) => {
      setSearchQuery(query.trim() || null);
      // A narrower result set can leave the current page out of range.
      setPaginationState({ page: 1, limit: paginationState.limit });
    },
    [setSearchQuery, setPaginationState, paginationState.limit],
  );

  const [inputFilterState] = useQueryFilterState([], "experiments", projectId);

  const [orderByState, setOrderByState] = useOrderByState({
    column: "startTime",
    order: "DESC",
  });

  const { timeRange, setTimeRange } = useTableDateRange(projectId, {
    defaultRelativeAggregation: "last30Days",
    persistAsDefault: false,
  });

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
    // v4-only surface — drives `isV4` on filters:* analytics (LFE-10781).
    isV4: true,
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
    searchFilter,
  );

  const filterState = combinedFilterState;

  // Use the custom hook for experiments data fetching
  const {
    experiments,
    totalCount,
    dataUpdatedAt,
    metricsLoading,
    isShowingMostRecent,
    mostRecentLimit,
  } = useExperimentsTableData({
    projectId,
    filterState,
    orderByState,
    paginationState,
  });

  // A score column that is empty for every experiment in view is noise, so only
  // create columns for the keys the metrics query actually returned. Undefined
  // while metrics load, so columns don't disappear and come back on each fetch.
  const presentScoreKeys = useMemo(() => {
    if (metricsLoading || experiments.status !== "success") return undefined;
    const rows = experiments.rows ?? [];
    return {
      traceItem: collectPresentScoreKeys(rows.map((r) => r.traceItemScores)),
      observationItem: collectPresentScoreKeys(
        rows.map((r) => r.observationItemScores),
      ),
      experiment: collectPresentScoreKeys(rows.map((r) => r.experimentScores)),
    };
  }, [experiments, metricsLoading]);

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
    presentKeys: presentScoreKeys?.traceItem,
  });

  // Observation-level item scores (scores on observations, observation_id IS NOT NULL)
  const {
    scoreColumns: observationItemScoreColumns,
    isLoading: isObservationItemScoreLoading,
  } = useScoreColumns<ExperimentsTableRow>({
    rawKey: true,
    displayFormat: "aggregate",
    scoreColumnKey: "observationItemScores",
    headerPrefix: "Observation",
    projectId,
    filter:
      experiments.rows && experiments.rows.length > 0
        ? scoreFilters.forExperimentItems({
            experimentIds: experiments.rows.map((e) => e.id),
          })
        : [],
    isFilterDataPending: experiments.status === "loading",
    presentKeys: presentScoreKeys?.observationItem,
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
    presentKeys: presentScoreKeys?.experiment,
  });

  const { selectActionColumn } = TableSelectionManager<ExperimentsTableRow>({
    projectId,
    tableName: "experiments",
    setSelectedRows: experimentsTableStore.getState().actions.setRowSelection,
    setSelectAll: experimentsTableStore.getState().actions.setSelectAll,
    selectionStore: experimentsTableStore,
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
      // Off by default: 300px of mostly boilerplate ahead of the score columns.
      defaultHidden: true,
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
      // Placed here (right after the identifying name/description columns) rather
      // than last so it is never the trailing column. As the last column its right
      // resize handle sat flush against the table edge and could not be dragged
      // wider in a maximized browser (LFE-10460).
      accessorKey: "metadata",
      id: "metadata",
      header: getExperimentsColumnName("metadata"),
      size: 100,
      enableHiding: true,
      defaultHidden: true,
      cell: ({ row }) => {
        const value: Record<string, string> = row.getValue("metadata");
        return <IOTableCell data={value} singleLine={rowHeight === "s"} />;
      },
    },
    createNumberTableColumn<ExperimentsTableRow>({
      accessorKey: "itemCount",
      header: getExperimentsColumnName("itemCount"),
      size: 100,
      formatter: (value) => numberFormatter(value, 0, 0),
    }),
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
    createDateTableColumn<ExperimentsTableRow>({
      accessorKey: "startTime",
      header: getExperimentsColumnName("startTime"),
      size: 150,
      enableHiding: true,
      enableSorting: true,
    }),
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
    createNumberTableColumn<ExperimentsTableRow>({
      accessorKey: "latencyAvg",
      header: getExperimentsColumnName("latencyAvg"),
      size: 100,
      enableHiding: true,
      headerTooltip: {
        description: "Average duration of the root span per experiment item.",
      },
      formatter: (value) => `${numberFormatter(value / 1000, 4)}s`,
      emptyCell: <NotRecordedMetric metric="latency" />,
      getValue: (value) =>
        metricsLoading ? { type: "loading" } : (value ?? undefined),
    }),
    createNumberTableColumn<ExperimentsTableRow>({
      accessorKey: "totalCost",
      header: getExperimentsColumnName("totalCost"),
      size: 100,
      enableHiding: true,
      formatter: (value) => `$${numberFormatter(value, 6)}`,
      emptyCell: <NotRecordedMetric metric="cost" />,
      // A run whose calls reported no usage or pricing sums to 0, which reads as
      // free rather than as missing.
      getValue: (value) =>
        metricsLoading ? { type: "loading" } : value || undefined,
    }),
    {
      accessorKey: "traceItemScores",
      header: "Trace Scores",
      id: "traceItemScores",
      enableHiding: true,
      cell: () => {
        return isTraceItemScoreLoading ? (
          <Skeleton className="h-3 w-1/2" />
        ) : null;
      },
      columns: traceItemScoreColumns,
    },
    {
      accessorKey: "observationItemScores",
      header: "Observation Scores",
      id: "observationItemScores",
      enableHiding: true,
      cell: () => {
        return isObservationItemScoreLoading ? (
          <Skeleton className="h-3 w-1/2" />
        ) : null;
      },
      columns: observationItemScoreColumns,
    },
    {
      accessorKey: "experimentScores",
      header: "Experiment Scores",
      id: "experimentScores",
      enableHiding: true,
      cell: () => {
        return isExperimentScoreColumnLoading ? (
          <Skeleton className="h-3 w-1/2" />
        ) : null;
      },
      columns: experimentScoreColumns,
    },
  ];

  const scoreColumnIds = useMemo(
    () =>
      [
        ...traceItemScoreColumns,
        ...observationItemScoreColumns,
        ...experimentScoreColumns,
      ].map((column) => column.accessorKey),
    [
      traceItemScoreColumns,
      observationItemScoreColumns,
      experimentScoreColumns,
    ],
  );

  // LFE-15711: score columns are now visible by default. A returning user has
  // `false` persisted for every one of them from the previous default, so this
  // one-time migration reaches them too — see `revealScoreColumns` for how a
  // user who picked their own score columns is left alone.
  const columnVisibilityMigrations = useMemo(
    () => [
      {
        versionKey: `experimentsColumnVisibility-scoresVisible-v1-${projectId}`,
        apply: (visibility: VisibilityState) =>
          revealScoreColumns(visibility, scoreColumnIds),
      },
    ],
    [projectId, scoreColumnIds],
  );

  const [columnVisibility, setColumnVisibilityState] =
    useColumnVisibility<ExperimentsTableRow>(
      `experimentsColumnVisibility-${projectId}`,
      columns,
      columnVisibilityMigrations,
    );

  // One-time migration for LFE-10460 on the localStorage replay path:
  // useColumnOrder replays a returning user's stored order verbatim and never
  // repositions an existing column, so without this metadata would stay the
  // trailing column and the resize bug would persist. Guarded by a version flag
  // so it runs once (won't re-fight a user who later moves metadata themselves).
  // The saved-view persistence path is covered separately via
  // `validationContext.migrateColumnOrder` below — both reuse
  // `repositionTrailingMetadata`.
  const columnOrderMigrations = useMemo(
    () => [
      {
        versionKey: `experimentsColumnOrder-metadataReorder-v1-${projectId}`,
        apply: repositionTrailingMetadata,
      },
    ],
    [projectId],
  );

  const [columnOrder, setColumnOrder] = useColumnOrder<ExperimentsTableRow>(
    `experimentsColumnOrder-${projectId}`,
    columns,
    columnOrderMigrations,
  );

  const { isLoading: isViewLoading, ...viewControllers } = useTableViewManager({
    tableName: TableViewPresetTableName.Experiments,
    projectId,
    stateUpdaters: {
      setOrderBy: setOrderByState,
      setFilters: setFiltersWrapper,
      setExpandedFilters: queryFilter.onExpandedChange,
      setColumnOrder: setColumnOrder,
      setColumnVisibility: setColumnVisibilityState,
      setSearchQuery,
    },
    validationContext: {
      columns,
      filterColumnDefinition: filterConfig.columnDefinitions,
      expandableFilterColumns: filterConfig.facets.map((facet) => facet.column),
      // A pre-PR saved view persists its own metadata-last column order, which
      // would otherwise re-introduce LFE-10460 after applying the view (the
      // localStorage migration is one-shot and doesn't reach this path). Reuse
      // the same "only reposition a stale default" transform here.
      migrateColumnOrder: repositionTrailingMetadata,
    },
    currentFilterState: queryFilter.explicitFilterState,
    currentExpandedFilters: queryFilter.expanded,
  });

  const rows: ExperimentsTableRow[] = useMemo(() => {
    return experiments.status === "success" && experiments.rows
      ? experiments.rows
      : [];
  }, [experiments]);

  // The strip's series. The strip orders its own x-axis chronologically, which
  // is deliberately not this table's newest-first order.
  const chartExperiments = useMemo(() => {
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      startTime: row.startTime,
    }));
  }, [rows]);

  // Mirror the visible page's rows into the store (in table order, so
  // selectedPageRowIds keeps the first-selected-in-table-order semantics
  // the compare baseline relies on).
  const pageRowIds = useMemo(() => rows.map((row) => row.id), [rows]);

  // Which score family do people actually want visible? The column drawer's
  // per-family Select All / Deselect All is the family-level intent; the
  // individual checkboxes stay on `table:column_visibility_changed`.
  const handleScoreColumnGroupToggle = useScoreColumnScopeAnalytics(
    SCORE_COLUMN_GROUP_SCOPES,
  );
  useExperimentsTableSelectionSync({
    store: experimentsTableStore,
    pageRowIds,
    totalCount,
  });

  return (
    <>
      <DataTableControlsProvider>
        <div className="flex h-full w-full flex-col">
          {showControlsInPageHeader && (
            <TableHeaderControls
              timeRange={timeRange}
              setTimeRange={setTimeRange}
            />
          )}
          {/* Toolbar spanning full width */}
          <DataTableToolbar
            // v4-only surface (LFE-15720).
            isV4
            columns={columns}
            filterState={queryFilter.filterState}
            viewConfig={{
              tableName: TableViewPresetTableName.Experiments,
              projectId,
              controllers: viewControllers,
            }}
            columnsWithCustomSelect={["name", "datasetId"]}
            searchConfig={{
              metadataSearchFields: ["Name"],
              updateQuery: submitSearch,
              currentQuery: searchQuery ?? undefined,
              tableAllowsFullTextSearch: false,
            }}
            columnVisibility={columnVisibility}
            setColumnVisibility={setColumnVisibilityState}
            columnOrder={columnOrder}
            setColumnOrder={setColumnOrder}
            orderByState={orderByState}
            rowHeight={rowHeight}
            setRowHeight={setRowHeight}
            mergeSettingsIntoPopover
            onColumnGroupToggle={handleScoreColumnGroupToggle}
            timeRange={showControlsInPageHeader ? undefined : timeRange}
            setTimeRange={showControlsInPageHeader ? undefined : setTimeRange}
            actionButtons={[
              <ExperimentsMultiSelectActionMenu
                key="experiments-multi-select-actions"
                projectId={projectId}
                store={experimentsTableStore}
              />,
            ]}
          />

          {tableDateRange && (
            <ExperimentMetricStrip
              projectId={projectId}
              experiments={chartExperiments}
              fromTimestamp={tableDateRange.from}
              toTimestamp={tableDateRange.to}
              isExternalLoading={experiments.status === "loading"}
            />
          )}

          {isShowingMostRecent && (
            <div className="text-muted-foreground border-t px-3 py-1.5 text-xs">
              No experiments started in the selected time range. Showing the{" "}
              {mostRecentLimit} most recent runs instead.
            </div>
          )}

          {/* Content area with sidebar and table */}
          <ResizableFilterLayout>
            <DataTableControls
              // Remount the sidebar when the saved view changes so the new view's filters replace any stale draft UI state.
              key={viewControllers.selectedViewId ?? "no-view"}
              queryFilter={queryFilter}
            />

            <div className="flex flex-1 flex-col overflow-hidden">
              <DataTable
                key={`experiments-table-${dataUpdatedAt}`}
                tableName="experiments"
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
                selectionStore={experimentsTableStore}
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
                    router.push(
                      `/project/${projectId}/experiments/results?baseline=${encodeURIComponent(row.id)}`,
                    );
                  }
                }}
              />
            </div>
          </ResizableFilterLayout>
        </div>
      </DataTableControlsProvider>
    </>
  );
}
