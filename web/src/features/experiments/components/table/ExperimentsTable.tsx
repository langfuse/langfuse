/* eslint-disable @repo/no-null-render */
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
import { EXPERIMENTS_FIELD_REGISTRY } from "@/src/features/experiments/constants/experimentsSearchRegistry";
import { withDatasetNamesResolved } from "@/src/features/experiments/fns/datasetNameFilter";
import { toObservedOptions } from "@/src/features/search-bar/lib/observed-options";
import { DEFAULT_SEARCH_TYPE } from "@/src/features/search-bar/lib/commit";
import { useEventsSearchBar } from "@/src/features/search-bar/hooks/useEventsSearchBar";
import { EventsSearchBarRow } from "@/src/features/search-bar/components/EventsSearchBarRow";
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
import { ChevronDown, GitCompareArrows, LightbulbIcon } from "lucide-react";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createIOTableColumn } from "@/src/components/design-system/table/columns/createIOTableColumn";
import Link from "next/link";
import { TableActionMenu } from "@/src/features/table/components/TableActionMenu";
import { type TableAction } from "@/src/features/table/types";
import { Badge } from "@/src/components/ui/badge";
import { type VisibilityState } from "@tanstack/react-table";
import { useStore } from "zustand";
import { createIdTableColumn } from "@/src/components/design-system/table/columns/createIdTableColumn";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useTableViewManager } from "@/src/components/table/table-view-presets/hooks/useTableViewManager";
import { useRouter } from "next/router";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import { useScoreColumns } from "@/src/features/scores/hooks/useScoreColumns";
import {
  collectPresentScoreKeys,
  revealScoreColumns,
  scoreFilters,
} from "@/src/features/scores/lib/scoreColumns";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { useExperimentsTableData } from "../../hooks/useExperimentsTableData";
import { type ExperimentsTableRow, type ExperimentsTableProps } from "./types";
import { useExperimentFilterOptions } from "../../hooks/useExperimentFilterOptions";
import { RunEvaluationDialog } from "@/src/features/batch-actions/components/RunEvaluationDialog";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { useHasProjectAccess } from "@/src/features/rbac";
import { ExperimentChartsGrid } from "../ExperimentChartsGrid";
import { useExperimentChartsAccordion } from "../../hooks/useExperimentChartsAccordion";
import {
  createExperimentsTableStore,
  type ExperimentsTableStore,
} from "@/src/features/experiments/store/experimentsTableStore";
import { useExperimentsTableSelectionSync } from "@/src/features/experiments/hooks/useExperimentsTableSelectionSync";
import { createExperimentMetricColumn } from "./createExperimentMetricColumn";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import {
  baselineChangedProps,
  comparisonChangedProps,
  chartsSectionToggledProps,
  scoreColumnScopeToggledProps,
} from "@/src/features/experiments/lib/analytics";
import { type ColumnGroupTogglePayload } from "@/src/components/table/data-table-column-visibility-filter";

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

/**
 * Owns every consumer of the selection state (action menu, compare navigation,
 * run-evaluator dialog) so checkbox clicks re-render only this menu and the
 * clicked checkbox — not the whole ExperimentsTable.
 */
function ExperimentsMultiSelectActionMenu({
  projectId,
  store,
  datasetIdByExperimentId,
}: {
  projectId: string;
  store: ExperimentsTableStore;
  datasetIdByExperimentId: Record<string, string>;
}) {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const [showRunEvaluationDialog, setShowRunEvaluationDialog] = useState(false);
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
    scope: "evaluationRule:CUD",
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
    capture(
      "experiment:comparison_changed",
      comparisonChangedProps({
        tableName: "experiments",
        comparisonCount: comparisons.length,
        datasetIds: selectedExperimentIds.map(
          (id) => datasetIdByExperimentId[id],
        ),
        source: "table-selection",
      }),
    );
    capture(
      "experiment:baseline_changed",
      baselineChangedProps({
        tableName: "experiments",
        source: "table-selection",
      }),
    );
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
              scope: "evaluationRule:CUD",
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

  const { setDetailPageList } = useDetailPageLists();
  // Selection lives in a per-mount vanilla zustand store (not useState) so a
  // checkbox click re-renders only its subscribers, not the whole table.
  const [experimentsTableStore] = useState(() => createExperimentsTableStore());

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
  const {
    filterOptions,
    datasetIdByName,
    datasetNameById,
    isFilterOptionsPending,
  } = useExperimentFilterOptions({
    projectId,
    oldFilterState,
  });

  // Built after the dataset map, which its filter-state migration needs to
  // translate a legacy dataset id into the name the facet is keyed by.
  const filterConfig = useMemo(
    () =>
      getExperimentsFilterConfig(
        fixedFilter
          .map((filter) => filter.column)
          .filter(isExperimentsOmittableFilterColumn),
        datasetNameById,
      ),
    [fixedFilter, datasetNameById],
  );

  const queryFilter = useSidebarFilterState(filterConfig, filterOptions, {
    loading: isFilterOptionsPending,
    stateLocation: "urlAndSessionStorage",
    sessionFilterContextId,
    // v4-only surface — drives `isV4` on filters:* analytics.
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

  // Grammar search bar: an ADDITIONAL editor over the same FilterState the
  // facet sidebar edits. Score filtering stays in the sidebar here — see
  // experimentsSearchRegistry.
  const observedOptions = useMemo(
    () => toObservedOptions(filterOptions, isFilterOptionsPending),
    [filterOptions, isFilterOptionsPending],
  );
  // The experiments table has no full-text lane, so the registry rejects free
  // text and these stay inert.
  const noSearchLane = useCallback(() => {}, []);
  const {
    store: searchBarStore,
    commit: searchBarCommit,
    applyFilters: searchBarApplyFilters,
  } = useEventsSearchBar({
    projectId,
    tableName: filterConfig.tableName,
    enabled: true,
    filterState: queryFilter.explicitFilterState,
    searchQuery: null,
    searchType: DEFAULT_SEARCH_TYPE,
    observed: observedOptions,
    setFilterState: setFiltersWrapper,
    setSearchQuery: noSearchLane,
    setSearchType: noSearchLane,
    registry: EXPERIMENTS_FIELD_REGISTRY,
  });

  const combinedFilterState = queryFilter.filterState.concat(
    dateRangeFilter,
    fixedFilter,
  );

  // The one boundary where a dataset NAME becomes its id — see
  // fns/datasetNameFilter.
  const filterState = useMemo(
    () => withDatasetNamesResolved(combinedFilterState, datasetIdByName),
    [combinedFilterState, datasetIdByName],
  );

  // Use the custom hook for experiments data fetching
  const { experiments, totalCount, dataUpdatedAt, metricsLoading } =
    useExperimentsTableData({
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
    createIdTableColumn<ExperimentsTableRow>({
      accessorKey: "name",
      header: getExperimentsColumnName("name"),
      size: 200,
      isPinnedLeft: true,
    }),
    createIOTableColumn<ExperimentsTableRow>({
      accessorKey: "description",
      header: getExperimentsColumnName("description"),
      size: 300,
      enableHiding: true,
      // Off by default: 300px of mostly boilerplate ahead of the score columns.
      defaultHidden: true,
      getCell: (value) => value || undefined,
      singleLine: rowHeight === "s",
    }),
    createIOTableColumn<ExperimentsTableRow>({
      // Placed here (right after the identifying name/description columns) rather
      // than last so it is never the trailing column. As the last column its right
      // resize handle sat flush against the table edge and could not be dragged
      // wider in a maximized browser (LFE-10460).
      accessorKey: "metadata",
      header: getExperimentsColumnName("metadata"),
      size: 100,
      enableHiding: true,
      defaultHidden: true,
      singleLine: rowHeight === "s",
    }),
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
      header: getExperimentsColumnName("experimentDatasetName"),
      size: 150,
      cell: ({ row }) => {
        const datasetId: string | undefined = row.getValue("datasetId");
        const datasetName = datasetId
          ? datasetNameById.get(datasetId)
          : undefined;

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
    createExperimentMetricColumn<ExperimentsTableRow>({
      metric: "latency",
      accessorKey: "latencyAvg",
      header: getExperimentsColumnName("latencyAvg"),
      size: 100,
      enableHiding: true,
      headerTooltip: {
        description: "Average duration of the root span per experiment item.",
      },
      formatter: (value) => `${numberFormatter(value / 1000, 4)}s`,
      metricsLoading,
    }),
    createExperimentMetricColumn<ExperimentsTableRow>({
      metric: "cost",
      accessorKey: "totalCost",
      header: getExperimentsColumnName("totalCost"),
      size: 100,
      enableHiding: true,
      formatter: (value) => `$${numberFormatter(value, 6)}`,
      metricsLoading,
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

  // Each score level loads from its own query, so the union above is partial
  // until all three have settled. The migration below is consumed once and for
  // good, so running it early would reveal whichever level answered first and
  // leave the other two hidden permanently.
  const areScoreColumnsSettled =
    !isTraceItemScoreLoading &&
    !isObservationItemScoreLoading &&
    !isExperimentScoreColumnLoading;

  // Score columns are now visible by default. A returning user has `false`
  // persisted for every one of them from the previous default, so this one-time
  // migration reaches them too — see `revealScoreColumns` for how a user who
  // picked their own score columns is left alone.
  const columnVisibilityMigrations = useMemo(
    () => [
      {
        versionKey: `experimentsColumnVisibility-scoresVisible-v1-${projectId}`,
        apply: (visibility: VisibilityState) =>
          areScoreColumnsSettled
            ? revealScoreColumns(visibility, scoreColumnIds)
            : null,
      },
    ],
    [projectId, scoreColumnIds, areScoreColumnsSettled],
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

  // Get experiments from the current query result (for charts)
  const chartExperiments = useMemo(() => {
    return rows.map((row) => ({ id: row.id, name: row.name }));
  }, [rows]);

  // Charts accordion collapsed state (persisted in session storage)
  const capture = usePostHogClientCapture();
  const { accordionValue, setAccordionValue } =
    useExperimentChartsAccordion(projectId);

  const datasetIdByExperimentId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of rows) {
      map[row.id] = row.datasetId;
    }
    return map;
  }, [rows]);

  const handleColumnGroupToggle = useCallback(
    ({ groupId, enabledCount }: ColumnGroupTogglePayload) => {
      const props = scoreColumnScopeToggledProps({
        tableName: "experiments",
        groupId,
        enabledCount,
      });
      if (props) {
        capture("experiment:score_column_scope_toggled", props);
      }
    },
    [capture],
  );

  const handleChartsAccordionChange = useCallback(
    (value: string) => {
      const isExpanded = value === "charts";
      const wasExpanded = accordionValue === "charts";
      if (isExpanded !== wasExpanded) {
        capture(
          "experiment:charts_section_toggled",
          chartsSectionToggledProps({
            tableName: "experiments",
            isExpanded,
          }),
        );
      }
      setAccordionValue(value);
    },
    [accordionValue, capture, setAccordionValue],
  );

  // Mirror the visible page's rows into the store (in table order, so
  // selectedPageRowIds keeps the first-selected-in-table-order semantics
  // the compare baseline relies on).
  const pageRowIds = useMemo(() => rows.map((row) => row.id), [rows]);
  useExperimentsTableSelectionSync({
    store: experimentsTableStore,
    pageRowIds,
    totalCount,
  });

  return (
    <>
      <DataTableControlsProvider tableName={filterConfig.tableName}>
        <div className="flex h-full w-full flex-col">
          {showControlsInPageHeader && (
            <TableHeaderControls
              timeRange={timeRange}
              setTimeRange={setTimeRange}
            />
          )}
          {/* The composer and the toolbar stick together as one band so the
              toolbar cannot scroll under the composer and render half-clipped;
              pb-1.5 matches the other bar surfaces' spacing above the table. */}
          <div className="bg-background sticky top-0 z-30 pb-1.5">
            <EventsSearchBarRow
              projectId={projectId}
              tableName={filterConfig.tableName}
              store={searchBarStore}
              commit={searchBarCommit}
              observed={observedOptions}
              onApplyFilters={searchBarApplyFilters}
              registry={EXPERIMENTS_FIELD_REGISTRY}
            />
            {/* Toolbar spanning full width */}
            <DataTableToolbar
              rowClassName="my-1"
              columns={columns}
              filterState={queryFilter.filterState}
              viewConfig={{
                tableName: TableViewPresetTableName.Experiments,
                projectId,
                controllers: viewControllers,
              }}
              tableName={filterConfig.tableName}
              isV4={true}
              onColumnGroupToggle={handleColumnGroupToggle}
              columnsWithCustomSelect={["name", "datasetId"]}
              columnVisibility={columnVisibility}
              setColumnVisibility={setColumnVisibilityState}
              columnOrder={columnOrder}
              setColumnOrder={setColumnOrder}
              orderByState={orderByState}
              rowHeight={rowHeight}
              setRowHeight={setRowHeight}
              timeRange={showControlsInPageHeader ? undefined : timeRange}
              setTimeRange={showControlsInPageHeader ? undefined : setTimeRange}
              actionButtons={[
                <ExperimentsMultiSelectActionMenu
                  key="experiments-multi-select-actions"
                  projectId={projectId}
                  store={experimentsTableStore}
                  datasetIdByExperimentId={datasetIdByExperimentId}
                />,
              ]}
            />
          </div>

          {/* Charts section - Collapsible Accordion */}
          {tableDateRange && (
            <AccordionPrimitive.Root
              type="single"
              collapsible
              value={accordionValue}
              onValueChange={handleChartsAccordionChange}
            >
              <AccordionPrimitive.Item className="border-t" value="charts">
                <AccordionPrimitive.Header className="flex">
                  <AccordionPrimitive.Trigger className="flex flex-1 items-center justify-between px-3 pt-2 pb-1 font-bold transition-all hover:no-underline [&[data-state=open]>svg]:rotate-180">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">Charts</span>
                    </div>
                    <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
                  </AccordionPrimitive.Trigger>
                </AccordionPrimitive.Header>
                <AccordionPrimitive.Content className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm transition-all">
                  <div className="px-3 pt-1 pb-1">
                    <div className="max-h-[40dvh] overflow-x-auto">
                      <ExperimentChartsGrid
                        projectId={projectId}
                        experiments={chartExperiments}
                        fromTimestamp={tableDateRange.from}
                        toTimestamp={tableDateRange.to}
                        isExternalLoading={experiments.status === "loading"}
                      />
                    </div>
                  </div>
                </AccordionPrimitive.Content>
              </AccordionPrimitive.Item>
            </AccordionPrimitive.Root>
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
