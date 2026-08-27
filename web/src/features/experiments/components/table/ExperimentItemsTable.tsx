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
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
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
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { usdFormatter, latencyFormatter } from "@/src/utils/numbers";
import {
  type RowSelectionState,
  type VisibilityState,
} from "@tanstack/react-table";
import TableIdOrName from "@/src/components/table/table-id";
import { createIdTableColumn } from "@/src/components/design-system/Table/columns/createIdTableColumn";
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
import { MemoizedIOTableCell } from "@/src/components/ui/IOTableCell";
import { Badge } from "@/src/components/ui/badge";
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
import { calculateNumericDiff } from "@/src/features/datasets/lib/calculateBaselineDiff";
import { computeScoreDiffs } from "@/src/features/datasets/lib/computeScoreDiffs";
import { TablePeekViewExperimentItemDetail } from "@/src/components/table/peek/peek-experiment-item-detail";
import { NotRecordedMetric } from "./NotRecordedMetric";
import {
  summariseScoreColumn,
  type ScoreColumnDataType,
  type ScoreColumnSummary,
} from "@/src/features/experiments/fns/summariseScoreColumn";
import { ScoreColumnHeaderSummary } from "./ScoreColumnHeaderSummary";
import { ScoreColumnFilterMenu } from "./ScoreColumnFilterMenu";
import { ScoreComparisonFilterPills } from "./ScoreComparisonFilterPills";
import {
  ExperimentScoreMatrix,
  type ScoreMatrixRow,
} from "./ExperimentScoreMatrix";
import { useScoreComparisonFilters } from "@/src/features/experiments/hooks/useScoreComparisonFilters";
import {
  describeEmptyScoreComparison,
  rowPassesScoreComparisonFilters,
  scoreFieldForLevel,
  type ScoreComparisonFilter,
  type ScoreLevel,
} from "@/src/features/experiments/fns/scoreComparisonFilter";
import { resetStaleDefaultColumnOrder } from "@/src/features/experiments/fns/experimentItemsColumnOrder";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  COMPARISON_OPERATOR_PROPERTY,
  EXPERIMENT_ANALYTICS_DIMENSIONS,
} from "@/src/features/experiments/constants/analytics";
import {
  useScoreColumnScopeAnalytics,
  type ScoreColumnGroupScopes,
} from "@/src/features/experiments/hooks/useScoreColumnScopeAnalytics";

/** The table's score column groups, by the score level each one holds. */
const SCORE_COLUMN_GROUP_SCOPES: ScoreColumnGroupScopes = {
  observationScores: "observation",
  traceScores: "trace",
};

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

/**
 * One summary per score column: the primary experiment's aggregate over the
 * items in view, and the same for the comparison it is read against. Built once
 * per fetch rather than per header render.
 */
function buildScoreColumnSummaries({
  rows,
  scoreField,
  dataTypeByKey,
  primaryExperimentId,
  comparisonExperimentId,
}: {
  rows: ExperimentItemsTableRow[];
  scoreField: "observationScores" | "traceScores";
  dataTypeByKey: Map<string, ScoreColumnDataType>;
  primaryExperimentId?: string;
  comparisonExperimentId?: string;
}): Map<string, ScoreColumnSummary> {
  const summaries = new Map<string, ScoreColumnSummary>();
  if (!primaryExperimentId) return summaries;

  const scoresFor = (row: ExperimentItemsTableRow, experimentId?: string) =>
    experimentId
      ? row.experiments.find((exp) => exp.experimentId === experimentId)?.[
          scoreField
        ]
      : undefined;

  for (const [key, dataType] of dataTypeByKey) {
    summaries.set(
      key,
      summariseScoreColumn({
        // Every item in view is a pair, including the ones only one of the two
        // experiments scored — those are counted as not comparable.
        pairs: rows.map((row) => ({
          baseline: scoresFor(row, primaryExperimentId)?.[key] ?? null,
          comparison: scoresFor(row, comparisonExperimentId)?.[key] ?? null,
        })),
        dataType,
        hasComparison: Boolean(comparisonExperimentId),
      }),
    );
  }

  return summaries;
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
  chip,
}: {
  output: string;
  markerClass: string;
  singleLine: boolean;
  /** Rendered after the value, e.g. the expected-output verdict. */
  chip?: React.ReactNode;
}) => {
  return (
    <div className="flex min-w-0 items-start">
      <span
        className={cn(
          "mt-0.5 mr-2 block h-4 w-0.5 shrink-0 rounded-full",
          markerClass,
        )}
      />
      <MemoizedIOTableCell
        isLoading={false}
        data={output}
        singleLine={singleLine}
        className="bg-accent-light-green"
      />
      {chip}
    </div>
  );
};

/**
 * Whether an output is the expected one. Exact match after trimming — anything
 * looser would be guessing at what "close enough" means for the user's data.
 */
const matchesExpectedOutput = (
  output: string | null | undefined,
  expectedOutput: string | null | undefined,
) =>
  Boolean(output && expectedOutput) &&
  output!.trim() === expectedOutput!.trim();

const ExpectedMatchChip = ({ matches }: { matches: boolean }) => (
  <Badge
    size="sm"
    variant={matches ? "success" : "error"}
    className="mt-0.5 ml-1 shrink-0 font-bold"
  >
    {matches ? "match" : "differs"}
  </Badge>
);

/**
 * Cell component that renders stacked output values for each experiment.
 */
const StackedOutputCell = ({
  outputs,
  allExperimentIds,
  colorExperimentIds,
  singleLine,
  isLoading,
  expectedOutput,
}: {
  outputs: ExperimentOutputData[];
  allExperimentIds: string[];
  colorExperimentIds?: string[];
  singleLine: boolean;
  isLoading: boolean;
  /**
   * The item's expected output, shown as the cell's first line with a verdict on
   * each output — the `Expected → Output` diff mode. Undefined in every other
   * mode, and for the items that simply have no expected output.
   */
  expectedOutput?: string | null;
}) => {
  const outputsByExperimentId = useMemo(
    () => new Map(outputs.map((out) => [out.experimentId, out])),
    [outputs],
  );

  const showExpectedLine = Boolean(expectedOutput);

  return (
    <div
      className="grid h-full min-h-0 gap-1"
      style={{
        gridTemplateRows: `repeat(${Math.max(allExperimentIds.length, 1) + (showExpectedLine ? 1 : 0)}, minmax(0, 1fr))`,
      }}
    >
      {showExpectedLine && (
        <div className="flex min-h-0 items-start overflow-hidden py-0.5 pr-1 pl-1.5">
          <div className="flex min-w-0 items-start">
            <span className="text-muted-foreground mt-0.5 mr-1 shrink-0 text-[10px] font-bold uppercase">
              Exp
            </span>
            <MemoizedIOTableCell
              isLoading={false}
              data={expectedOutput ?? null}
              singleLine={singleLine}
            />
          </div>
        </div>
      )}
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
                <MemoizedIOTableCell
                  isLoading={true}
                  data={null}
                  singleLine={singleLine}
                />
              </div>
            ) : out?.output ? (
              <StackedOutputRow
                output={out.output}
                markerClass={colorStyles.markerClass}
                singleLine={singleLine}
                chip={
                  showExpectedLine ? (
                    <ExpectedMatchChip
                      matches={matchesExpectedOutput(
                        out.output,
                        expectedOutput,
                      )}
                    />
                  ) : undefined
                }
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
  const capture = usePostHogClientCapture();
  // The column drawer's per-family Select All / Deselect All — the family-level
  // intent behind "which score family do people want visible".
  const handleScoreColumnGroupToggle = useScoreColumnScopeAnalytics(
    SCORE_COLUMN_GROUP_SCOPES,
  );
  const [selectedRows, setSelectedRows] = useState<RowSelectionState>({});
  const [showRunEvaluationDialog, setShowRunEvaluationDialog] = useState(false);
  const hasEvalAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:CUD",
  });

  const {
    baselineId,
    hasBaseline,
    comparisonIds,
    allExperimentIds,
    layout,
    diffMode,
    itemVisibility,
  } = useExperimentResultsState();

  // "Off" turns the whole diff apparatus into plain values; "expected" keeps the
  // baseline deltas on the scores (a score has no expected value to diff
  // against) and points the output cell at the item's expected output instead.
  const showComparisonDiff = diffMode !== "off";
  const isExpectedDiff = diffMode === "expected";

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

  // Medium by default: with the ids out of the cell a row no longer needs the
  // tallest option to show its output, and two rows per screen was the
  // complaint. Large stays one click away for reading long outputs.
  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(
    "experiment-items",
    "m",
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
  const queryFilter = useSidebarFilterState(
    experimentItemsFilterConfig,
    scoreFilterOptions,
    {
      stateLocation: "url",
      loading: isFilterOptionsLoading,
      // v4-only surface — drives `isV4` on filters:* analytics (LFE-10781).
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
      setFilterTargets((prev) => ({
        ...prev,
        [originalIndex]: toExperimentId,
      }));
    },
    [filterTargets, defaultFilterTargetExperimentId],
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
  // on it when nothing in view has one. Kept while IO loads so it doesn't flash.
  const showExpectedOutput = useMemo(
    () =>
      ioLoading ||
      (items.rows ?? []).some((row) => Boolean(row.expectedOutput)),
    [ioLoading, items.rows],
  );

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

  // The experiment a score column's header reads as "this experiment", and the
  // one it is compared against. Without an explicit baseline the first selected
  // run stands in, matching how the cells pick their reference.
  const primaryExperimentId = baselineId ?? allExperimentIds[0];
  const primaryComparisonId = allExperimentIds.find(
    (id) => id !== primaryExperimentId,
  );
  const primaryComparisonName = useMemo(
    () =>
      selectedExperimentNames.find(
        (exp) => exp.experimentId === primaryComparisonId,
      )?.experimentName,
    [selectedExperimentNames, primaryComparisonId],
  );

  const scoreDataTypesByKey = useMemo(() => {
    const build = (columns: ScoreColumnDef[]) =>
      new Map(
        toScoreColumnInput(columns).map(({ key, dataType }) => [key, dataType]),
      );
    return {
      observationScores: build(scoreColumnDefs.observationScoreColumns),
      traceScores: build(scoreColumnDefs.traceScoreColumns),
    };
  }, [
    scoreColumnDefs.observationScoreColumns,
    scoreColumnDefs.traceScoreColumns,
  ]);

  const scoreNamesByKey = useMemo(() => {
    const build = (columns: ScoreColumnDef[]) =>
      new Map(toScoreColumnInput(columns).map(({ key, name }) => [key, name]));
    return {
      observationScores: build(scoreColumnDefs.observationScoreColumns),
      traceScores: build(scoreColumnDefs.traceScoreColumns),
    };
  }, [
    scoreColumnDefs.observationScoreColumns,
    scoreColumnDefs.traceScoreColumns,
  ]);

  const {
    filters: scoreComparisonFilters,
    setFilter: setScoreComparisonFilter,
    removeFilter: removeScoreComparisonFilter,
  } = useScoreComparisonFilters();

  // Is the regression filter used once it exists? The question the whole
  // rebuild is for, so it carries the score's level and type, which comparison
  // it reads against, and whether the user picked it or arrived with it in a
  // shared URL. No score name and no score value — those are user content.
  // (LFE-15720)
  const captureScoreComparisonFilter = useCallback(
    ({
      filter,
      dataType,
      source,
    }: {
      filter: ScoreComparisonFilter;
      dataType: ScoreColumnDataType | undefined;
      source: "header_menu" | "url";
    }) =>
      capture("experiment:score_comparison_filter_applied", {
        scoreLevel: filter.level,
        dataType: dataType ?? "unknown",
        operator: COMPARISON_OPERATOR_PROPERTY[filter.operator],
        comparisonIndex: comparisonIds.indexOf(filter.comparisonExperimentId),
        source,
        ...EXPERIMENT_ANALYTICS_DIMENSIONS,
      }),
    [capture, comparisonIds],
  );

  // A results page can arrive with the filter already in the URL. Reported once
  // per page, after the score column definitions land (they carry the data
  // type), and never again — it is a shared view, not an action.
  const hasReportedUrlScoreFilters = useRef(false);
  useEffect(() => {
    if (hasReportedUrlScoreFilters.current) return;
    if (isFilterOptionsLoading) return;
    hasReportedUrlScoreFilters.current = true;
    for (const filter of scoreComparisonFilters) {
      captureScoreComparisonFilter({
        filter,
        dataType: scoreDataTypesByKey[scoreFieldForLevel(filter.level)].get(
          filter.scoreKey,
        ),
        source: "url",
      });
    }
  }, [
    isFilterOptionsLoading,
    scoreComparisonFilters,
    scoreDataTypesByKey,
    captureScoreComparisonFilter,
  ]);

  // The runs a score can be read against, the auto-selected comparison first so
  // the menu's default is the one the column header already reports.
  const comparisonTargets = useMemo(() => {
    const others = selectedExperimentNames.filter(
      (exp) => exp.experimentId !== primaryExperimentId,
    );
    return [
      ...others.filter((exp) => exp.experimentId === primaryComparisonId),
      ...others.filter((exp) => exp.experimentId !== primaryComparisonId),
    ].map(({ experimentId, experimentName }) => ({
      experimentId,
      experimentName,
    }));
  }, [selectedExperimentNames, primaryExperimentId, primaryComparisonId]);

  const scoreDataTypeFor = useCallback(
    (filter: ScoreComparisonFilter) =>
      scoreDataTypesByKey[scoreFieldForLevel(filter.level)].get(
        filter.scoreKey,
      ),
    [scoreDataTypesByKey],
  );

  const scoreColumnSummaries = useMemo(() => {
    const rowsInView = items.rows ?? [];
    return {
      observationScores: buildScoreColumnSummaries({
        rows: rowsInView,
        scoreField: "observationScores",
        dataTypeByKey: scoreDataTypesByKey.observationScores,
        primaryExperimentId,
        comparisonExperimentId: primaryComparisonId,
      }),
      traceScores: buildScoreColumnSummaries({
        rows: rowsInView,
        scoreField: "traceScores",
        dataTypeByKey: scoreDataTypesByKey.traceScores,
        primaryExperimentId,
        comparisonExperimentId: primaryComparisonId,
      }),
    };
  }, [
    items.rows,
    scoreDataTypesByKey,
    primaryExperimentId,
    primaryComparisonId,
  ]);

  const buildExperimentScoreColumns = useCallback(
    (
      scoreColumns: LangfuseColumnDef<ExperimentItemData>[],
      scoreField: "observationScores" | "traceScores",
    ): LangfuseColumnDef<ExperimentItemsTableRow>[] =>
      scoreColumns.map((scoreCol) => {
        const key = scoreCol.accessorKey?.replace(`Trace-`, "");
        const summary = key
          ? scoreColumnSummaries[scoreField].get(key)
          : undefined;
        const dataType = key
          ? scoreDataTypesByKey[scoreField].get(key)
          : undefined;
        const label =
          typeof scoreCol.header === "string"
            ? scoreCol.header
            : (scoreCol.accessorKey ?? "");
        const level: ScoreLevel =
          scoreField === "traceScores" ? "trace" : "observation";
        const activeComparisonFilter = key
          ? scoreComparisonFilters.find(
              (filter) => filter.level === level && filter.scoreKey === key,
            )
          : undefined;

        return {
          ...scoreCol,
          // The header carries the column's aggregate over the items in view, and
          // the movement against the comparison. Keeps the plain name for the
          // column picker.
          ...(summary && dataType
            ? {
                headerBlock: true,
                headerLabel: label,
                header: () => (
                  <ScoreColumnHeaderSummary
                    label={label}
                    dataType={dataType}
                    summary={summary}
                    comparisonName={primaryComparisonName}
                    filterMenu={
                      <ScoreColumnFilterMenu
                        targets={comparisonTargets}
                        hasOrder={dataType !== "CATEGORICAL"}
                        active={activeComparisonFilter}
                        onSelect={(operator, comparisonExperimentId) => {
                          if (!key) return;
                          const nextFilter = {
                            level,
                            scoreKey: key,
                            operator,
                            comparisonExperimentId,
                          };
                          captureScoreComparisonFilter({
                            filter: nextFilter,
                            dataType,
                            source: "header_menu",
                          });
                          setScoreComparisonFilter(nextFilter);
                        }}
                        onClear={() =>
                          activeComparisonFilter &&
                          removeScoreComparisonFilter(activeComparisonFilter)
                        }
                      />
                    }
                  />
                ),
              }
            : {}),
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
                    showComparisonDiff &&
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
        };
      }) as LangfuseColumnDef<ExperimentItemsTableRow>[],
    [
      allExperimentIds,
      baselineId,
      colorExperimentIds,
      hasBaseline,
      primaryComparisonName,
      scoreColumnSummaries,
      scoreDataTypesByKey,
      showComparisonDiff,
      comparisonTargets,
      scoreComparisonFilters,
      setScoreComparisonFilter,
      removeScoreComparisonFilter,
      captureScoreComparisonFilter,
    ],
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

  const expectedOutputColumn: LangfuseColumnDef<ExperimentItemsTableRow> = {
    accessorKey: "expectedOutput",
    id: "expectedOutput",
    header: "Expected Output",
    size: 300,
    enableHiding: true,
    cell: ({ row }) => {
      const expectedOutput = row.original.expectedOutput;
      // An empty expected output used to render as two literal quote characters.
      if (!ioLoading && !expectedOutput) return undefined;
      return (
        <MemoizedIOTableCell
          isLoading={ioLoading}
          data={expectedOutput ?? null}
          singleLine={ioSingleLine}
          className="bg-accent-light-green"
        />
      );
    },
  };

  const baselineExperimentOf = (experiments: ExperimentItemData[]) =>
    hasBaseline && baselineId
      ? experiments.find((exp) => exp.experimentId === baselineId)
      : undefined;

  /** A comparison line's move against the baseline's, lower being better. */
  const renderMetricDiff = ({
    exp,
    value,
    baselineValue,
    format,
  }: {
    exp: ExperimentItemData;
    value?: number | null;
    baselineValue?: number | null;
    format: (value: number) => string;
  }) => {
    if (!showComparisonDiff || exp.experimentId === baselineId) return null;
    const diff = calculateNumericDiff(value, baselineValue);
    if (!diff) return null;
    return <DiffLabel diff={diff} preferNegativeDiff formatValue={format} />;
  };

  const columns: LangfuseColumnDef<ExperimentItemsTableRow>[] = [
    ...(hideControls ? [] : [selectActionColumn]),
    createIdTableColumn<ExperimentItemsTableRow>({
      accessorKey: "itemId",
      header: "Item ID",
      size: 150,
      enableHiding: true,
    }),
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
            singleLine={ioSingleLine}
          />
        );
      },
    },
    // The scores sit between the item's input and its outputs: the input says
    // which item this is, the score headers carry the judgement, and the outputs
    // are the drill-down a regression sends you to (peek carries it too).
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
    // The expected output moves inside the output cell in that diff mode, so it
    // does not also hold a column of its own.
    ...(showExpectedOutput && !isExpectedDiff ? [expectedOutputColumn] : []),
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
            // Items with no expected output get no expected line and no
            // verdict, rather than a diff against nothing.
            expectedOutput={
              isExpectedDiff
                ? (row.original.expectedOutput ?? undefined)
                : undefined
            }
          />
        );
      },
    },
    // Cost and latency read as measurements, the ids as lookups — both
    // sit behind the score columns so the analysis is above the fold.
    {
      accessorKey: "totalCost",
      id: "totalCost",
      header: () =>
        renderExperimentSpecificHeader(
          getExperimentItemsColumnName("totalCost"),
        ),
      size: 120,
      enableHiding: true,
      cell: ({ row }) => {
        const experiments = row.original.experiments;
        const baselineCost = baselineExperimentOf(experiments)?.totalCost;
        return (
          <StackedExperimentCell
            experiments={experiments}
            allExperimentIds={allExperimentIds}
            colorExperimentIds={colorExperimentIds}
            renderValue={(exp) => (
              <span className="inline-flex items-center gap-1">
                {exp.totalCost ? (
                  usdFormatter(exp.totalCost, 2, 6)
                ) : (
                  <NotRecordedMetric metric="cost" />
                )}
                {renderMetricDiff({
                  exp,
                  value: exp.totalCost,
                  baselineValue: baselineCost,
                  format: (value) => usdFormatter(value, 2, 6),
                })}
              </span>
            )}
          />
        );
      },
    },
    {
      accessorKey: "latencyMs",
      id: "latencyMs",
      header: () =>
        renderExperimentSpecificHeader(
          getExperimentItemsColumnName("latencyMs"),
        ),
      size: 120,
      enableHiding: true,
      cell: ({ row }) => {
        const experiments = row.original.experiments;
        const baselineLatency = baselineExperimentOf(experiments)?.latencyMs;
        return (
          <StackedExperimentCell
            experiments={experiments}
            allExperimentIds={allExperimentIds}
            colorExperimentIds={colorExperimentIds}
            renderValue={(exp) => (
              <span className="inline-flex items-center gap-1">
                {exp.latencyMs != null ? (
                  latencyFormatter(exp.latencyMs)
                ) : (
                  <NotRecordedMetric metric="latency" />
                )}
                {renderMetricDiff({
                  exp,
                  value: exp.latencyMs,
                  baselineValue: baselineLatency,
                  format: latencyFormatter,
                })}
              </span>
            )}
          />
        );
      },
    },
    {
      accessorKey: "observationId",
      id: "observationId",
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
            renderValue={(exp) => <TableIdOrName value={exp.observationId} />}
          />
        );
      },
    },
    {
      accessorKey: "startTime",
      id: "startTime",
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
            renderValue={(exp) => <LocalIsoDate date={exp.startTime} />}
          />
        );
      },
    },
    {
      accessorKey: "level",
      id: "level",
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
      accessorKey: "experimentId",
      id: "experimentId",
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
  ];

  const scoreColumnIds = useMemo(
    () =>
      [...observationScoreColumns, ...traceScoreColumns].map(
        (column) => column.accessorKey,
      ),
    [observationScoreColumns, traceScoreColumns],
  );

  // LFE-15711: score columns are now visible by default. A returning user has
  // `false` persisted for every one of them from the previous default, so this
  // one-time migration reaches them too — see `revealScoreColumns` for how a
  // user who picked their own score columns is left alone.
  const columnVisibilityMigrations = useMemo(
    () => [
      {
        versionKey: `experimentItemsColumnVisibility-scoresVisible-v1-${projectId}`,
        apply: (visibility: VisibilityState) =>
          revealScoreColumns(visibility, scoreColumnIds),
      },
    ],
    [projectId, scoreColumnIds],
  );

  const [columnVisibility, setColumnVisibilityState] =
    useColumnVisibility<ExperimentItemsTableRow>(
      `experimentItemsColumnVisibility-${projectId}`,
      columns,
      columnVisibilityMigrations,
    );

  // LFE-15711: the score columns moved ahead of the metrics and ids so their
  // headers' analysis needs no horizontal scroll. A returning user has the old
  // order persisted, so the new default only reaches him through a migration —
  // and only when that stored order is still a default, not one he arranged.
  const columnOrderMigrations = useMemo(
    () => [
      {
        versionKey: `experimentItemsColumnOrder-scoresEarlier-v2-${projectId}`,
        apply: resetStaleDefaultColumnOrder,
      },
    ],
    [projectId],
  );

  const [columnOrder, setColumnOrder] = useColumnOrder<ExperimentItemsTableRow>(
    `experimentItemsColumnOrder-${projectId}`,
    columns,
    columnOrderMigrations,
  );

  // The transposed layout's axes (LFE-15711 C8): score columns as rows —
  // respecting what the column picker hid — and the selected runs as columns,
  // baseline first. Both are a re-read of what the grid already has, so the
  // layout needs no query of its own.
  const matrixScoreRows = useMemo<ScoreMatrixRow[]>(() => {
    const build = (
      scoreCols: LangfuseColumnDef<ExperimentItemData>[],
      level: ScoreLevel,
    ): ScoreMatrixRow[] =>
      scoreCols.flatMap((scoreCol) => {
        const accessorKey = scoreCol.accessorKey;
        if (!accessorKey || columnVisibility[accessorKey] === false) return [];
        const scoreKey = accessorKey.replace(/^Trace-/, "");
        const dataType =
          scoreDataTypesByKey[scoreFieldForLevel(level)].get(scoreKey);
        if (!dataType) return [];
        return [
          {
            scoreKey,
            level,
            dataType,
            label:
              typeof scoreCol.header === "string" ? scoreCol.header : scoreKey,
          },
        ];
      });
    return [
      ...build(observationScoreColumns, "observation"),
      ...build(traceScoreColumns, "trace"),
    ];
  }, [
    observationScoreColumns,
    traceScoreColumns,
    scoreDataTypesByKey,
    columnVisibility,
  ]);

  const matrixExperiments = useMemo(
    () =>
      [
        ...(primaryExperimentId ? [primaryExperimentId] : []),
        ...allExperimentIds.filter((id) => id !== primaryExperimentId),
      ].map((experimentId) => ({
        experimentId,
        experimentName:
          selectedExperimentNames.find(
            (exp) => exp.experimentId === experimentId,
          )?.experimentName ?? experimentId.slice(0, 8),
        isBaseline: experimentId === primaryExperimentId,
      })),
    [allExperimentIds, primaryExperimentId, selectedExperimentNames],
  );

  const peekNavigationProps = usePeekNavigation({
    tableName: "experiment-items",
    queryParams: [
      "observation",
      "display",
      "timestamp",
      "traceId",
      "peekExperimentId",
    ],
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
    if (items.status !== "success" || !items.rows) return [];
    // Add 'id' field for DataTable row identification (peek view requires it)
    const withIds = items.rows.map((row) => ({ ...row, id: row.itemId }));
    // The score comparison filters narrow the page here rather than in the
    // query — see `useScoreComparisonFilters` for why. The header aggregates
    // deliberately keep describing the whole fetched page, so the movement the
    // filter was built from stays readable while it is applied.
    return withIds.filter((row) =>
      rowPassesScoreComparisonFilters({
        filters: scoreComparisonFilters,
        experiments: row.experiments,
        baselineExperimentId: primaryExperimentId,
        dataTypeFor: scoreDataTypeFor,
      }),
    );
  }, [items, scoreComparisonFilters, primaryExperimentId, scoreDataTypeFor]);

  useEffect(() => {
    if (items.status === "success") {
      // Store all experiment targets for peek navigation
      setDetailPageList(
        "experiment-items",
        rows.map((item: ExperimentItemsTableRow) => {
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
  }, [items.status, rows, baselineId]);

  // Plain English for the active comparisons, and for the table when they leave
  // nothing: "no regressions on this score" is an answer, not a broken table.
  const scoreComparisonPills = useMemo(
    () =>
      scoreComparisonFilters.map((filter) => ({
        filter,
        scoreName:
          scoreNamesByKey[scoreFieldForLevel(filter.level)].get(
            filter.scoreKey,
          ) ?? filter.scoreKey,
        comparisonName:
          selectedExperimentNames.find(
            (exp) => exp.experimentId === filter.comparisonExperimentId,
          )?.experimentName ?? filter.comparisonExperimentId,
      })),
    [scoreComparisonFilters, scoreNamesByKey, selectedExperimentNames],
  );

  const scoreComparisonEmptyMessage = useMemo(() => {
    if (rows.length > 0 || (items.rows ?? []).length === 0) return undefined;
    if (scoreComparisonPills.length !== 1)
      return scoreComparisonPills.length > 1
        ? "No item on this page matches every score comparison."
        : undefined;
    const [pill] = scoreComparisonPills;
    return describeEmptyScoreComparison({
      operator: pill.filter.operator,
      scoreName: pill.scoreName,
      comparisonName: pill.comparisonName,
    });
  }, [rows.length, items.rows, scoreComparisonPills]);

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
            scope: "evalJob:CUD",
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
            // v4-only surface (LFE-15720).
            isV4
            onColumnGroupToggle={handleScoreColumnGroupToggle}
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

        {/* Score comparison filters — evaluated over the loaded page */}
        <ScoreComparisonFilterPills
          pills={scoreComparisonPills}
          onRemove={removeScoreComparisonFilter}
          className="border-b"
        />

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
            {layout === "matrix" ? (
              hasSelectedRuns ? (
                <ExperimentScoreMatrix
                  rows={rows}
                  scoreRows={matrixScoreRows}
                  experiments={matrixExperiments}
                  isLoading={items.status === "loading" || isViewLoading}
                />
              ) : (
                <div className="flex flex-1 items-center justify-center">
                  <span className="text-muted-foreground text-sm">
                    Please select a baseline experiment.
                  </span>
                </div>
              )
            ) : layout === "grid" ? (
              hasSelectedRuns ? (
                <ExperimentGridView
                  projectId={projectId}
                  baselineExperimentId={baselineId}
                  comparisonExperimentIds={
                    baselineId ? comparisonIds : allExperimentIds
                  }
                  useExperimentColors={hasBaseline}
                  showDiff={showComparisonDiff}
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
                  ) : scoreComparisonEmptyMessage ? (
                    <span className="text-muted-foreground text-sm">
                      {scoreComparisonEmptyMessage}
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
