/* eslint-disable @repo/no-style-props */
import { useExperimentResultsState } from "@/src/features/experiments/hooks/useExperimentResultsState";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import {
  DataTableControlsProvider,
  DataTableControls,
} from "@/src/components/table/data-table-controls";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { RunEvaluationDialog } from "@/src/features/batch-actions/components/RunEvaluationDialog";
import { LightbulbIcon } from "lucide-react";
import { useHasProjectAccess } from "@/src/features/rbac";
import { TableActionMenu } from "@/src/features/table/components/TableActionMenu";
import { type TableAction } from "@/src/features/table/types";
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
  BatchExportTableName,
  ActionId,
  BatchActionType,
} from "@langfuse/shared";
import { ExperimentFilterPills } from "./ExperimentFilterPills";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import {
  itemRegressionFilterAppliedProps,
  scoreColumnScopeToggledProps,
} from "@/src/features/experiments/lib/analytics";
import { type ColumnGroupTogglePayload } from "@/src/components/table/data-table-column-visibility-filter";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { buildLocalIsoDatePresentation } from "@/src/utils/dates";
import { usdFormatter, latencyFormatter } from "@/src/utils/numbers";
import {
  type RowSelectionState,
  type VisibilityState,
} from "@tanstack/react-table";
import { IdTableCell } from "@/src/components/design-system/table/components/IdTableCell/IdTableCell";
import { createIdTableColumn } from "@/src/components/design-system/table/columns/createIdTableColumn";
import { createIOTableColumn } from "@/src/components/design-system/table/columns/createIOTableColumn";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { ExperimentGridView } from "./ExperimentGridView";
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
  getExperimentColorStyles,
} from "./types";
import { ConnectedIOTableCell } from "@/src/components/table/ConnectedIOTableCell";
import { type DataTablePeekViewProps } from "@/src/components/table/peek";
import { cn } from "@/src/utils/tailwind";
import { createScoreColumns } from "@/src/features/scores/hooks/useScoreColumns";
import {
  collectPresentScoreKeys,
  revealScoreColumns,
  withPresentScoreKeys,
} from "@/src/features/scores/lib/scoreColumns";
import { composeAggregateScoreKey } from "@/src/features/scores/lib/aggregateScores";
import { Skeleton } from "@/src/components/ui/skeleton";
import { ExperimentCompareTable } from "./ExperimentCompareTable";
import { useExperimentNames } from "@/src/features/experiments/hooks/useExperimentNames";
import {
  useExperimentItemsFilterOptions,
  type ScoreColumnDef,
} from "@/src/features/experiments/hooks/useExperimentItemsFilterOptions";
import { DiffLabel } from "@/src/features/datasets/components/DiffLabel";
import { computeScoreDiffs } from "@/src/features/datasets/lib/computeScoreDiffs";
import { TablePeekViewExperimentItemDetail } from "@/src/components/table/peek/peek-experiment-item-detail";
import { NotRecordedMetric } from "./NotRecordedMetric";

const renderExperimentSpecificHeader = (label: string) => (
  <span className="text-muted-foreground">{label}</span>
);

/**
 * Transforms score column definitions to the format expected by createScoreColumns.
 * Computes the aggregate key from name/source/dataType.
 */
function toScoreColumnInput(scoreColumnDefs: ScoreColumnDef[]): Array<{
  key: string;
  name: string;
  source: string;
  dataType: "NUMERIC" | "BOOLEAN" | "CATEGORICAL";
}> {
  return scoreColumnDefs.map(({ name, dataType, source }) => ({
    key: composeAggregateScoreKey({
      name,
      source: source as "API" | "ANNOTATION" | "EVAL",
      dataType,
    }),
    name,
    source,
    dataType,
  }));
}

const getDefaultExperimentFilterTarget = (props: {
  baselineId?: string;
  comparisonIds: string[];
}) => props.baselineId ?? props.comparisonIds[0];

const shouldEnableExperimentPeek = (props: {
  hasBaseline: boolean;
  hideControls: boolean;
}) => !props.hideControls && props.hasBaseline;

/**
 * Cell component that renders stacked values for each experiment.
 * Uses CSS grid for consistent horizontal alignment across columns.
 */
const StackedExperimentCell = ({
  experiments,
  allExperimentIds,
  colorExperimentIds,
  renderValue,
  className,
}: {
  experiments: ExperimentItemData[];
  allExperimentIds: string[];
  colorExperimentIds?: string[];
  renderValue: (exp: ExperimentItemData) => React.ReactNode;
  className?: string;
}) => {
  const experimentsById = useMemo(
    () => new Map(experiments.map((exp) => [exp.experimentId, exp])),
    [experiments],
  );

  return (
    <div
      className={cn("grid h-full min-h-0", className)}
      style={{
        gridTemplateRows: `repeat(${Math.max(allExperimentIds.length, 1)}, minmax(0, 1fr))`,
      }}
    >
      {allExperimentIds.map((experimentId) => {
        const exp = experimentsById.get(experimentId);
        const colorStyles = getExperimentColorStyles(
          experimentId,
          colorExperimentIds ?? allExperimentIds,
        );
        const content = exp ? renderValue(exp) : null;
        return (
          <div
            key={experimentId}
            className="flex min-h-0 items-start overflow-hidden py-0.5 pr-2 pl-1.5"
          >
            {content ? (
              <>
                <span
                  className={cn(
                    "mt-0.5 mr-2 block h-4 w-0.5 shrink-0 rounded-full",
                    colorStyles.markerClass,
                  )}
                />
                {content}
              </>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        );
      })}
    </div>
  );
};

/**
 * A single experiment's output within the stacked list cell. Renders the
 * compact (truncated) output value from the list query.
 */
const StackedOutputRow = ({
  output,
  markerClass,
  singleLine,
}: {
  output: string;
  markerClass: string;
  singleLine: boolean;
}) => {
  return (
    <div className="flex min-w-0 items-start">
      <span
        className={cn(
          "mt-0.5 mr-2 block h-4 w-0.5 shrink-0 rounded-full",
          markerClass,
        )}
      />
      <ConnectedIOTableCell
        data={output}
        singleLine={singleLine}
        variant="output"
      />
    </div>
  );
};

/**
 * Cell component that renders stacked output values for each experiment.
 */
const StackedOutputCell = ({
  outputs,
  allExperimentIds,
  colorExperimentIds,
  singleLine,
  isLoading,
}: {
  outputs: ExperimentOutputData[];
  allExperimentIds: string[];
  colorExperimentIds?: string[];
  singleLine: boolean;
  isLoading: boolean;
}) => {
  const outputsByExperimentId = useMemo(
    () => new Map(outputs.map((out) => [out.experimentId, out])),
    [outputs],
  );

  return (
    <div
      className="grid h-full min-h-0 gap-1"
      style={{
        gridTemplateRows: `repeat(${Math.max(allExperimentIds.length, 1)}, minmax(0, 1fr))`,
      }}
    >
      {allExperimentIds.map((experimentId) => {
        const out = outputsByExperimentId.get(experimentId);
        const colorStyles = getExperimentColorStyles(
          experimentId,
          colorExperimentIds ?? allExperimentIds,
        );
        return (
          <div
            key={experimentId}
            className="flex min-h-0 items-start overflow-hidden py-0.5 pr-1 pl-1.5"
          >
            {isLoading ? (
              <div className="flex min-w-0 items-start">
                <span className="bg-muted mt-0.5 mr-2 block h-4 w-0.5 shrink-0 rounded-full" />
                <ConnectedIOTableCell isLoading singleLine={singleLine} />
              </div>
            ) : out?.output ? (
              <StackedOutputRow
                output={out.output}
                markerClass={colorStyles.markerClass}
                singleLine={singleLine}
              />
            ) : (
              <span className="text-muted-foreground px-2 py-1">—</span>
            )}
          </div>
        );
      })}
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
  ioRenderMode,
  hideControls = false,
}: ExperimentItemsTableProps) {
  const { setDetailPageList } = useDetailPageLists();
  const [selectedRows, setSelectedRows] = useState<RowSelectionState>({});
  const [showRunEvaluationDialog, setShowRunEvaluationDialog] = useState(false);
  const hasEvalAccess = useHasProjectAccess({
    projectId,
    scope: "evaluationRule:CUD",
  });

  const {
    baselineId,
    hasBaseline,
    comparisonIds,
    allExperimentIds,
    layout,
    itemVisibility,
  } = useExperimentResultsState();

  const defaultFilterTargetExperimentId = getDefaultExperimentFilterTarget({
    baselineId,
    comparisonIds,
  });
  const hasSelectedRuns = allExperimentIds.length > 0;
  const canUsePeek = shouldEnableExperimentPeek({
    hasBaseline,
    hideControls,
  });
  const { experimentNames } = useExperimentNames({ projectId });
  const selectedExperimentNames = useMemo(() => {
    return experimentNames.filter((exp) =>
      allExperimentIds.includes(exp.experimentId),
    );
  }, [experimentNames, allExperimentIds]);

  const { selectAll, setSelectAll } = useSelectAll(
    projectId,
    "experiment-items",
  );

  const [paginationState, setPaginationState] = usePaginationState(0, 20, {
    page: "pageIndex",
    limit: "pageSize",
  });

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(
    "experiment-items",
    "l",
  );
  const ioSingleLine = ioRenderMode === "text";

  const [orderByState, setOrderByState] = useOrderByState({
    column: "startTime",
    order: "DESC",
  });

  // Fetch score filter options scoped to selected experiments
  const {
    filterOptions: scoreFilterOptions,
    scoreColumns: scoreColumnDefs,
    isLoading: isFilterOptionsLoading,
  } = useExperimentItemsFilterOptions({
    projectId,
    experimentIds: allExperimentIds,
  });

  // Use sidebar filter state for the sidebar UI (provides proper facets, options, etc.)
  // This is the single source of truth for filters
  const capture = usePostHogClientCapture();
  const queryFilter = useSidebarFilterState(
    experimentItemsFilterConfig,
    scoreFilterOptions,
    {
      stateLocation: "url",
      loading: isFilterOptionsLoading,
      // v4-only surface — drives `isV4` on filters:* analytics.
      isV4: true,
    },
  );

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
    if (!defaultFilterTargetExperimentId) return [];

    // Group filters by target experiment
    const grouped: Record<string, FilterState> = {};
    filterState.forEach((filter, index) => {
      const targetExp = filterTargets[index] ?? defaultFilterTargetExperimentId;
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
  }, [queryFilter.filterState, filterTargets, defaultFilterTargetExperimentId]);

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
        const target = filterTargets[i] ?? defaultFilterTargetExperimentId;
        if (target === _fromExperimentId) {
          if (currentGroupIndex === filterIndex) {
            originalIndex = i;
            break;
          }
          currentGroupIndex++;
        }
      }

      // Update the target for this filter
      if (toExperimentId !== _fromExperimentId) {
        const props = itemRegressionFilterAppliedProps({
          tableName: "experiment-items",
          column: _filter.column,
          operator: _filter.operator,
          toExperimentId,
          baselineId,
          comparisonIds,
        });
        if (props) {
          capture("experiment:item_regression_filter_applied", props);
        }
      }
      setFilterTargets((prev) => ({
        ...prev,
        [originalIndex]: toExperimentId,
      }));
    },
    [
      filterTargets,
      defaultFilterTargetExperimentId,
      baselineId,
      comparisonIds,
      capture,
    ],
  );

  // Handler for removing a filter via pill
  const handleFilterRemove = useCallback(
    (experimentIdToRemoveFrom: string, filterIndex: number) => {
      const filterState = queryFilterRef.current.filterState;

      // Find the original filter index
      let originalIndex = 0;
      let currentGroupIndex = 0;

      for (let i = 0; i < filterState.length; i++) {
        const target = filterTargets[i] ?? defaultFilterTargetExperimentId;
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
    [filterTargets, defaultFilterTargetExperimentId],
  );

  // Use the custom hook for experiment items data fetching
  const { items, totalCount, dataUpdatedAt, ioLoading } =
    useExperimentItemsTableData({
      projectId,
      baseExperimentId: baselineId,
      compExperimentIds: comparisonIds,
      filterByExperiment: filtersByExperiment.map((filter) => ({
        experimentId: filter.runId,
        filters: filter.filters,
      })),
      orderByState,
      paginationState: {
        page: paginationState.pageIndex + 1,
        limit: paginationState.pageSize,
      },
      itemVisibility,
    });

  // Running items without an expected output is common, so don't spend a column
  // on it when nothing has one. Kept while IO loads so it doesn't flash.
  //
  // Whether the column exists is a property of the runs being compared, not of
  // the page that happens to be loaded, so a page of items that all lack an
  // expected output must not take the column away again. Latched per selection:
  // once any page has shown one, the column stays until the selection changes.
  const expectedOutputOnPage = useMemo(
    () => (items.rows ?? []).some((row) => Boolean(row.expectedOutput)),
    [items.rows],
  );
  const experimentSelectionKey = useMemo(
    () => allExperimentIds.join(","),
    [allExperimentIds],
  );
  const [expectedOutputSeenFor, setExpectedOutputSeenFor] = useState<
    string | null
  >(null);
  useEffect(() => {
    if (expectedOutputOnPage) setExpectedOutputSeenFor(experimentSelectionKey);
  }, [expectedOutputOnPage, experimentSelectionKey]);
  const showExpectedOutput =
    ioLoading ||
    expectedOutputOnPage ||
    expectedOutputSeenFor === experimentSelectionKey;

  useEffect(() => {
    if (items.status === "success") {
      // Store all experiment targets for peek navigation
      setDetailPageList(
        "experiment-items",
        items?.rows?.map((item: ExperimentItemsTableRow) => {
          const baselineExp = baselineId
            ? item.experiments.find((e) => e.experimentId === baselineId)
            : item.experiments[0];

          // Build experiment targets map for all experiments
          const experimentTargets = Object.fromEntries(
            item.experiments.map((exp) => [
              exp.experimentId,
              {
                traceId: exp.traceId,
                observationId: exp.observationId,
                timestamp: exp.startTime.toISOString(),
              },
            ]),
          );

          return {
            id: item.itemId,
            params: {
              // Primary trace params (baseline, for URL compat and initial load)
              traceId: baselineExp?.traceId ?? "",
              observation: baselineExp?.observationId ?? "",
              timestamp: baselineExp?.startTime?.toISOString() ?? "",
            },
            // All experiment targets for switching between experiments.
            // Kept out of `params` so they never leak into the URL.
            meta: { experimentTargets },
          };
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.status, items.rows, baselineId]);

  const { selectActionColumn } = TableSelectionManager<ExperimentItemsTableRow>(
    {
      projectId,
      tableName: "experiment-items",
      setSelectedRows,
      setSelectAll,
    },
  );

  const colorExperimentIds = useMemo(
    () => (hasBaseline ? allExperimentIds : []),
    [hasBaseline, allExperimentIds],
  );

  // A score column that is empty for every item in view is noise, so only keep
  // the keys the items query actually returned. Undefined while items load, so
  // columns don't disappear and come back on each fetch.
  const presentScoreKeys = useMemo(() => {
    if (items.status !== "success") return undefined;
    const experimentsInView = (items.rows ?? []).flatMap(
      (row) => row.experiments,
    );
    return {
      observation: collectPresentScoreKeys(
        experimentsInView.map((exp) => exp.observationScores),
      ),
      trace: collectPresentScoreKeys(
        experimentsInView.map((exp) => exp.traceScores),
      ),
    };
  }, [items]);

  // Create score columns from the shared filter options data
  // This ensures sidebar filters and column visibility use the same data source
  const observationScoreColumns = useMemo(
    () =>
      createScoreColumns<ExperimentItemData>({
        scoreColumns: withPresentScoreKeys(
          toScoreColumnInput(scoreColumnDefs.observationScoreColumns),
          presentScoreKeys?.observation,
        ),
        scoreColumnKey: "observationScores",
        displayFormat: "smart",
        headerPrefix: "Observation",
        rawKey: true,
      }),
    [scoreColumnDefs.observationScoreColumns, presentScoreKeys?.observation],
  );

  const traceScoreColumns = useMemo(
    () =>
      createScoreColumns<ExperimentItemData>({
        scoreColumns: withPresentScoreKeys(
          toScoreColumnInput(scoreColumnDefs.traceScoreColumns),
          presentScoreKeys?.trace,
        ),
        scoreColumnKey: "traceScores",
        displayFormat: "smart",
        prefix: "Trace",
        rawKey: true,
      }),
    [scoreColumnDefs.traceScoreColumns, presentScoreKeys?.trace],
  );

  // Use the shared loading state for both sidebar and columns
  const isObservationScoreColumnsLoading = isFilterOptionsLoading;
  const isTraceScoreColumnsLoading = isFilterOptionsLoading;

  const buildExperimentScoreColumns = useCallback(
    (
      scoreColumns: LangfuseColumnDef<ExperimentItemData>[],
      scoreField: "observationScores" | "traceScores",
    ): LangfuseColumnDef<ExperimentItemsTableRow>[] =>
      scoreColumns.map((scoreCol) => ({
        ...scoreCol,
        // Override the cell renderer to show stacked scores for each experiment
        cell: ({ row }) => {
          const experiments = row.original.experiments;
          const baselineExperiment = hasBaseline
            ? experiments.find((exp) => exp.experimentId === baselineId)
            : undefined;
          const baselineScoresData = baselineExperiment?.[scoreField] ?? null;
          // todo: fix properly
          const scoreKey = scoreCol.accessorKey?.replace(`Trace-`, "");
          return (
            <StackedExperimentCell
              experiments={experiments}
              allExperimentIds={allExperimentIds}
              colorExperimentIds={colorExperimentIds}
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
                const diff =
                  hasBaseline &&
                  baselineId &&
                  exp.experimentId !== baselineId &&
                  scoreKey &&
                  baselineScoresData
                    ? computeScoreDiffs(scoresData, baselineScoresData)[
                        scoreKey
                      ]
                    : null;

                const renderedScore =
                  typeof scoreCell === "function"
                    ? scoreCell({
                        row: mockRow,
                        getValue: mockRow.getValue,
                      } as any)
                    : null;

                return (
                  <div className="flex items-center gap-1">
                    {renderedScore}
                    {diff && (
                      <DiffLabel
                        diff={diff}
                        formatValue={(v) => v.toFixed(2)}
                      />
                    )}
                  </div>
                );
              }}
            />
          );
        },
      })) as LangfuseColumnDef<ExperimentItemsTableRow>[],
    [allExperimentIds, baselineId, colorExperimentIds, hasBaseline],
  );

  const observationExperimentScoreColumns = useMemo(
    () =>
      buildExperimentScoreColumns(observationScoreColumns, "observationScores"),
    [observationScoreColumns, buildExperimentScoreColumns],
  );

  const traceExperimentScoreColumns = useMemo(
    () => buildExperimentScoreColumns(traceScoreColumns, "traceScores"),
    [traceScoreColumns, buildExperimentScoreColumns],
  );

  const observationScoreOrder = useMemo(
    () =>
      observationScoreColumns
        .map((col) => col.accessorKey)
        .filter((key): key is string => typeof key === "string"),
    [observationScoreColumns],
  );

  const traceScoreOrder = useMemo(
    () =>
      traceScoreColumns
        .map((col) => col.accessorKey?.replace(/^Trace-/, ""))
        .filter((key): key is string => typeof key === "string"),
    [traceScoreColumns],
  );

  const showScoreLevelLabels =
    scoreColumnDefs.observationScoreColumns.length > 0 &&
    scoreColumnDefs.traceScoreColumns.length > 0;

  const expectedOutputColumn = createIOTableColumn<ExperimentItemsTableRow>({
    accessorKey: "expectedOutput",
    header: "Expected Output",
    size: 300,
    enableHiding: true,
    // An empty expected output used to render as two literal quote characters.
    getCell: (value) => (ioLoading ? { type: "loading" } : value || undefined),
    singleLine: ioSingleLine,
    variant: "output",
  }) as LangfuseColumnDef<ExperimentItemsTableRow>;

  const columns: LangfuseColumnDef<ExperimentItemsTableRow>[] = [
    ...(hideControls ? [] : [selectActionColumn]),
    createIdTableColumn<ExperimentItemsTableRow>({
      accessorKey: "itemId",
      header: "Item ID",
      size: 150,
      enableHiding: true,
    }),
    {
      accessorKey: "observationId",
      id: "observationId",
      headerLabel: "Observation ID",
      header: () => renderExperimentSpecificHeader("Observation ID"),
      size: 180,
      enableHiding: true,
      cell: ({ row }) => {
        const experiments = row.original.experiments;
        return (
          <StackedExperimentCell
            experiments={experiments}
            allExperimentIds={allExperimentIds}
            colorExperimentIds={colorExperimentIds}
            renderValue={(exp) => <IdTableCell value={exp.observationId} />}
          />
        );
      },
    },
    {
      accessorKey: "startTime",
      id: "startTime",
      headerLabel: getExperimentItemsColumnName("startTime"),
      header: () =>
        renderExperimentSpecificHeader(
          getExperimentItemsColumnName("startTime"),
        ),
      size: 180,
      defaultHidden: true,
      enableHiding: true,
      enableSorting: true,
      cell: ({ row }) => {
        const experiments = row.original.experiments;
        return (
          <StackedExperimentCell
            experiments={experiments}
            allExperimentIds={allExperimentIds}
            colorExperimentIds={colorExperimentIds}
            renderValue={(exp) => {
              const preparedDate = buildLocalIsoDatePresentation({
                date: exp.startTime,
              });

              return preparedDate ? (
                <span title={preparedDate.title}>{preparedDate.display}</span>
              ) : null;
            }}
          />
        );
      },
    },
    {
      accessorKey: "level",
      id: "level",
      headerLabel: getExperimentItemsColumnName("level"),
      header: () =>
        renderExperimentSpecificHeader(getExperimentItemsColumnName("level")),
      size: 120,
      defaultHidden: true,
      enableHiding: true,
      cell: ({ row }) => {
        const experiments = row.original.experiments;
        return (
          <StackedExperimentCell
            experiments={experiments}
            allExperimentIds={allExperimentIds}
            colorExperimentIds={colorExperimentIds}
            renderValue={(exp) => <span>{exp.level}</span>}
          />
        );
      },
    },
    {
      accessorKey: "totalCost",
      id: "totalCost",
      headerLabel: getExperimentItemsColumnName("totalCost"),
      header: () =>
        renderExperimentSpecificHeader(
          getExperimentItemsColumnName("totalCost"),
        ),
      size: 120,
      enableHiding: true,
      cell: ({ row }) => {
        const experiments = row.original.experiments;
        return (
          <StackedExperimentCell
            experiments={experiments}
            allExperimentIds={allExperimentIds}
            colorExperimentIds={colorExperimentIds}
            renderValue={(exp) =>
              exp.totalCost ? (
                <span>{usdFormatter(exp.totalCost, 2, 6)}</span>
              ) : (
                <NotRecordedMetric metric="cost" />
              )
            }
          />
        );
      },
    },
    {
      accessorKey: "latencyMs",
      id: "latencyMs",
      headerLabel: getExperimentItemsColumnName("latencyMs"),
      header: () =>
        renderExperimentSpecificHeader(
          getExperimentItemsColumnName("latencyMs"),
        ),
      size: 120,
      enableHiding: true,
      cell: ({ row }) => {
        const experiments = row.original.experiments;
        return (
          <StackedExperimentCell
            experiments={experiments}
            allExperimentIds={allExperimentIds}
            colorExperimentIds={colorExperimentIds}
            renderValue={(exp) =>
              exp.latencyMs != null ? (
                <span>{latencyFormatter(exp.latencyMs)}</span>
              ) : (
                <NotRecordedMetric metric="latency" />
              )
            }
          />
        );
      },
    },
    {
      accessorKey: "experimentId",
      id: "experimentId",
      headerLabel: "Experiment",
      header: () => renderExperimentSpecificHeader("Experiment"),
      size: 150,
      defaultHidden: true,
      enableHiding: true,
      cell: ({ row }) => {
        const experiments = row.original.experiments;
        return (
          <StackedExperimentCell
            experiments={experiments}
            allExperimentIds={allExperimentIds}
            colorExperimentIds={colorExperimentIds}
            renderValue={(exp) => {
              const expOption = selectedExperimentNames.find(
                (e) => e.experimentId === exp.experimentId,
              );
              const experimentLabel =
                expOption?.experimentName ?? exp.experimentId.slice(0, 8);
              return (
                <span className="truncate text-xs" title={experimentLabel}>
                  {experimentLabel}
                </span>
              );
            }}
          />
        );
      },
    },
    createIOTableColumn<ExperimentItemsTableRow>({
      accessorKey: "input",
      header: "Input",
      size: 300,
      enableHiding: true,
      getCell: (value) => (ioLoading ? { type: "loading" } : (value ?? null)),
      singleLine: ioSingleLine,
    }),
    ...(showExpectedOutput ? [expectedOutputColumn] : []),
    {
      accessorKey: "output",
      id: "output",
      header: "Output",
      size: 300,
      enableHiding: true,
      cell: ({ row }) => {
        const outputs = row.original.outputs ?? [];
        return (
          <StackedOutputCell
            outputs={outputs}
            allExperimentIds={allExperimentIds}
            colorExperimentIds={colorExperimentIds}
            singleLine={ioSingleLine}
            isLoading={ioLoading}
          />
        );
      },
    },
    {
      accessorKey: "observationScores",
      header: "Observation Scores",
      id: "observationScores",
      enableHiding: true,
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
      cell: () => {
        return isTraceScoreColumnsLoading ? (
          <Skeleton className="h-3 w-1/2" />
        ) : null;
      },
      columns: traceExperimentScoreColumns,
    },
  ];

  const scoreColumnIds = useMemo(
    () =>
      [...observationScoreColumns, ...traceScoreColumns].map(
        (column) => column.accessorKey,
      ),
    [observationScoreColumns, traceScoreColumns],
  );

  // Score columns are now visible by default. A returning user has `false`
  // persisted for every one of them from the previous default, so this one-time
  // migration reaches them too — see `revealScoreColumns` for how a user who
  // picked their own score columns is left alone. It is consumed once and for
  // good, so it waits for the score columns to be known rather than running
  // against an empty or half-loaded set.
  const columnVisibilityMigrations = useMemo(
    () => [
      {
        versionKey: `experimentItemsColumnVisibility-scoresVisible-v1-${projectId}`,
        apply: (visibility: VisibilityState) =>
          isFilterOptionsLoading
            ? null
            : revealScoreColumns(visibility, scoreColumnIds),
      },
    ],
    [projectId, scoreColumnIds, isFilterOptionsLoading],
  );

  const [columnVisibility, setColumnVisibilityState] =
    useColumnVisibility<ExperimentItemsTableRow>(
      `experimentItemsColumnVisibility-${projectId}`,
      columns,
      columnVisibilityMigrations,
    );

  const [columnOrder, setColumnOrder] = useColumnOrder<ExperimentItemsTableRow>(
    `experimentItemsColumnOrder-${projectId}`,
    columns,
  );

  const peekNavigationProps = usePeekNavigation({
    queryParams: [
      "observation",
      "display",
      "timestamp",
      "traceId",
      "peekExperimentId",
    ],
    tableName: experimentItemsFilterConfig.tableName,
    isV4: true,
    extractParamsValuesFromRow: (row: ExperimentItemsTableRow) => {
      // Use the explicit baseline when present. Without one, use the first
      // selected experiment only as the primary trace for URL-compatible peek
      // navigation; it is not treated as a baseline in comparison logic.
      const baselineExp = baselineId
        ? row.experiments.find((e) => e.experimentId === baselineId)
        : row.experiments[0];
      return {
        traceId: baselineExp?.traceId || "",
        timestamp: baselineExp?.startTime.toISOString() || "",
        observation: baselineExp?.observationId || "",
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
      setExpandedFilters: queryFilter.onExpandedChange,
      setColumnOrder: setColumnOrder,
      setColumnVisibility: setColumnVisibilityState,
    },
    validationContext: {
      columns,
      filterColumnDefinition: experimentItemsFilterConfig.columnDefinitions,
      expandableFilterColumns: experimentItemsFilterConfig.facets.map(
        (facet) => facet.column,
      ),
    },
    currentFilterState: queryFilter.explicitFilterState,
    currentExpandedFilters: queryFilter.expanded,
  });

  const peekConfig: DataTablePeekViewProps | undefined = useMemo(() => {
    if (!canUsePeek) return undefined;
    return {
      itemType: "TRACE",
      detailNavigationKey: "experiment-items",
      ...peekNavigationProps,
    };
  }, [peekNavigationProps, canUsePeek]);

  const rows: ExperimentItemsTableRow[] = useMemo(() => {
    if (items.status === "success" && items.rows) {
      // Add 'id' field for DataTable row identification (peek view requires it)
      return items.rows.map((row) => ({ ...row, id: row.itemId }));
    }
    return [];
  }, [items]);

  const pagination = useMemo(
    () => ({
      totalCount: totalCount ?? null,
      onChange: setPaginationState,
      state: paginationState,
    }),
    [paginationState, setPaginationState, totalCount],
  );

  // Compute selected observation IDs for batch evaluation
  const selectedObservationIds = useMemo(() => {
    const selectedItemIds = Object.keys(selectedRows);
    return (
      rows
        ?.filter((row) => selectedItemIds.includes(row.itemId))
        .flatMap((row) => row.experiments.map((exp) => exp.observationId))
        .filter((id): id is string => Boolean(id)) ?? []
    );
  }, [selectedRows, rows]);

  // Get example observation for preview in the evaluation dialog
  const exampleObservation = useMemo(() => {
    // Find first experiment with a non-null observationId from selected rows
    for (const row of rows ?? []) {
      if (!selectedRows[row.itemId]) continue;
      for (const exp of row.experiments) {
        if (exp.observationId && exp.traceId) {
          return {
            id: exp.observationId,
            traceId: exp.traceId,
            startTime: exp.startTime,
          };
        }
      }
    }
    return undefined;
  }, [rows, selectedRows]);

  // Count of selected items (not observations) for display
  const selectedItemCount = useMemo(() => {
    return Object.keys(selectedRows).filter((itemId) =>
      rows?.some((row) => row.itemId === itemId),
    ).length;
  }, [selectedRows, rows]);

  // Build query for batch actions (includes experiment context filter and root span filter)
  const batchActionQuery = useMemo(
    () => ({
      filter: [
        ...filtersByExperiment.flatMap((f) => f.filters),
        // Include experiment context filter
        ...(allExperimentIds.length > 0
          ? [
              {
                column: "experimentId" as const,
                operator: "any of" as const,
                value: allExperimentIds,
                type: "stringOptions" as const,
              },
            ]
          : []),
        // Only target root spans of experiment items
        {
          column: "isExperimentItemRootSpan" as const,
          operator: "=" as const,
          value: true,
          type: "boolean" as const,
        },
      ],
      orderBy: orderByState,
    }),
    [filtersByExperiment, orderByState, allExperimentIds],
  );

  const handleColumnGroupToggle = useCallback(
    ({ groupId, enabledCount }: ColumnGroupTogglePayload) => {
      const props = scoreColumnScopeToggledProps({
        tableName: "experiment-items",
        groupId,
        enabledCount,
      });
      if (props) {
        capture("experiment:score_column_scope_toggled", props);
      }
    },
    [capture],
  );

  const tableActions: TableAction[] = hasEvalAccess
    ? [
        {
          id: ActionId.ObservationBatchEvaluation,
          type: BatchActionType.Create,
          label: "Evaluate",
          description: "Run evaluators on selected items",
          icon: <LightbulbIcon className="h-4 w-4 sm:mr-2" />,
          customDialog: true,
          accessCheck: {
            scope: "evaluationRule:CUD",
          },
        } as TableAction,
      ]
    : [];

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
            tableName={experimentItemsFilterConfig.tableName}
            isV4={true}
            onColumnGroupToggle={handleColumnGroupToggle}
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
              pageSize: paginationState.pageSize,
              pageIndex: paginationState.pageIndex,
            }}
            actionButtons={
              (selectAll || selectedItemCount > 0) && tableActions.length > 0
                ? [
                    <TableActionMenu
                      key="experiment-items-multi-select-actions"
                      projectId={projectId}
                      actions={tableActions}
                      tableName={BatchExportTableName.Sessions}
                      selectedCount={selectAll ? totalCount : selectedItemCount}
                      onClearSelection={() => {
                        setSelectedRows({});
                        setSelectAll(false);
                      }}
                      onCustomAction={(actionId) => {
                        if (actionId === ActionId.ObservationBatchEvaluation) {
                          setShowRunEvaluationDialog(true);
                        }
                      }}
                    />,
                  ]
                : undefined
            }
          />
        )}

        {/* Filter Pills with Experiment Targeting */}
        {filtersByExperiment.length > 0 && (
          <ExperimentFilterPills
            selectedExperimentNames={selectedExperimentNames}
            filtersByExperiment={filtersByExperiment}
            onFilterTargetChange={handleFilterTargetChange}
            onFilterRemove={handleFilterRemove}
            className="border-b"
          />
        )}

        {/* Content area with sidebar and table */}
        <ResizableFilterLayout>
          {!hideControls && (
            <DataTableControls
              // Remount the sidebar when the saved view changes so the new view's filters replace any stale draft UI state.
              key={viewControllers.selectedViewId ?? "no-view"}
              queryFilter={queryFilter}
            />
          )}

          <div className="flex flex-1 flex-col overflow-hidden">
            {layout === "grid" ? (
              hasSelectedRuns ? (
                <ExperimentGridView
                  projectId={projectId}
                  baselineExperimentId={baselineId}
                  comparisonExperimentIds={
                    baselineId ? comparisonIds : allExperimentIds
                  }
                  useExperimentColors={hasBaseline}
                  singleLine={ioSingleLine}
                  rows={rows}
                  isLoading={items.status === "loading" || isViewLoading}
                  rowHeight={rowHeight}
                  showExpectedOutput={showExpectedOutput}
                  pagination={pagination}
                  observationScoreOrder={observationScoreOrder}
                  traceScoreOrder={traceScoreOrder}
                  showScoreLevelLabels={showScoreLevelLabels}
                  peekView={peekConfig}
                  columnVisibility={columnVisibility}
                  selectActionColumn={
                    hideControls ? undefined : selectActionColumn
                  }
                  rowSelection={selectedRows}
                  setRowSelection={setSelectedRows}
                  highlightAllRows={selectAll}
                />
              ) : (
                <div className="flex flex-1 items-center justify-center">
                  <span className="text-muted-foreground text-sm">
                    Please select a baseline experiment.
                  </span>
                </div>
              )
            ) : (
              <ExperimentCompareTable
                dataUpdatedAt={dataUpdatedAt}
                columns={columns}
                rows={rows}
                isLoading={items.status === "loading" || isViewLoading}
                isError={items.status === "error"}
                pagination={pagination}
                rowSelection={selectedRows}
                setRowSelection={setSelectedRows}
                setOrderBy={setOrderByState}
                orderBy={orderByState}
                columnOrder={columnOrder}
                onColumnOrderChange={setColumnOrder}
                columnVisibility={columnVisibility}
                onColumnVisibilityChange={setColumnVisibilityState}
                rowHeight={rowHeight}
                peekView={peekConfig}
                noResultsMessage={
                  !hasSelectedRuns ? (
                    <span className="text-muted-foreground text-sm">
                      Please select a baseline experiment.
                    </span>
                  ) : undefined
                }
                highlightAllRows={selectAll}
              />
            )}
          </div>
        </ResizableFilterLayout>

        {/* Peek view panel */}
        {peekConfig && (
          <TablePeekViewExperimentItemDetail
            {...peekConfig}
            projectId={projectId}
          />
        )}

        {/* Run Evaluation Dialog */}
        {showRunEvaluationDialog && (
          <RunEvaluationDialog
            projectId={projectId}
            selectedObservationIds={selectedObservationIds}
            query={batchActionQuery}
            selectAll={selectAll}
            totalCount={
              selectAll
                ? (totalCount ?? 0) * allExperimentIds.length
                : selectedItemCount
            }
            onClose={() => {
              setShowRunEvaluationDialog(false);
              setSelectedRows({});
              setSelectAll(false);
            }}
            experimentCount={allExperimentIds.length}
            exampleObservation={exampleObservation}
            sourceTable="experiment-items"
          />
        )}
      </div>
    </DataTableControlsProvider>
  );
}
