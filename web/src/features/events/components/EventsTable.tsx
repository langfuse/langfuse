import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import {
  DataTableControlsProvider,
  DataTableControls,
} from "@/src/components/table/data-table-controls";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { startOfMinute } from "date-fns";
import { usePaginationState } from "@/src/hooks/usePaginationState";
import {
  type UseSidebarFilterStateOptions,
  useSidebarFilterPresentation,
  useSidebarFilterStateCore,
} from "@/src/features/filters/hooks/useSidebarFilterState";
import {
  getEventsColumnName,
  getObservationEventsFilterConfig,
  type ObservationEventsOmittableFilterColumn,
} from "../config/filter-config";
import { buildSidebarFilterSessionContextId } from "@/src/features/filters/lib/persistedSidebarFilterQuery";
import {
  DEFAULT_SIDEBAR_IMPLICIT_ENVIRONMENT_CONFIG,
  type ObservationLevelType,
  type FilterState,
  BatchExportTableName,
  type ObservationType,
  TableViewPresetTableName,
  type TableViewPresetState,
  BatchActionType,
  ActionId,
  RESOURCE_LIMIT_ERROR_MESSAGE,
  type TimeFilter,
  type TracingSearchType,
  type ScoreAggregate,
  buildTracePath,
  getCachedInputCost,
  getCachedInputMetric,
} from "@langfuse/shared";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { Skeleton } from "@/src/components/ui/skeleton";
import { createBadgeTableColumn } from "@/src/components/design-system/table/columns/createBadgeTableColumn";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createDurationTableColumn } from "@/src/components/design-system/table/columns/createDurationTableColumn";
import { createIdTableColumn } from "@/src/components/design-system/table/columns/createIdTableColumn";
import { createItemBadgeTableColumn } from "@/src/components/design-system/table/columns/createItemBadgeTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createIOTableColumn } from "@/src/components/design-system/table/columns/createIOTableColumn";
import { createStatusTableColumn } from "@/src/components/design-system/table/columns/createStatusTableColumn";
import { createTagsTableColumn } from "@/src/components/design-system/table/columns/createTagsTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";
import { cn } from "@/src/utils/tailwind";
import { getObservationLevelStatus } from "@/src/components/level-colors";
import {
  compactNumberFormatter,
  numberFormatter,
  usdFormatter,
} from "@/src/utils/numbers";
import {
  formatObservationCost,
  isObservationCostDisplayable,
} from "@/src/utils/observationCost";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import {
  getRowHeightIOCharLimit,
  useRowHeightLocalStorage,
} from "@/src/components/table/data-table-row-height-switch";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { useLiveTableDateRange } from "@/src/hooks/useLiveTableDateRange";
import { usePaginationWindowPin } from "@/src/components/table/hooks/usePaginationWindowPin";
import {
  type TableDateRange,
  TABLE_AGGREGATION_OPTIONS,
} from "@/src/utils/date-range-utils";
import { TableHeaderControls } from "@/src/components/table/table-header-controls";
import { TimeRangePicker } from "@/src/components/date-picker";
import { DataTableRefreshButton } from "@/src/components/table/data-table-refresh-button";
import { MobileFiltersSheet } from "@/src/features/events/components/MobileFiltersSheet";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { usePeekTableState } from "@/src/components/table/peek/contexts/PeekTableStateContext";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { BatchExportTableButton } from "@/src/components/BatchExportTableButton";
import { BreakdownTooltip } from "@/src/features/traces";
import { InfoIcon, LightbulbIcon } from "lucide-react";
import { ProvidedModelNameCell } from "@/src/features/models/components/ProvidedModelNameCell";
import { type RowSelectionState } from "@tanstack/react-table";
import { TablePeekViewObservationDetail } from "@/src/components/table/peek/peek-observation-detail";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import {
  detailPageListKeys,
  useDetailPageLists,
} from "@/src/features/navigate-detail-pages/context";
import { useTableViewManager } from "@/src/components/table/table-view-presets/hooks/useTableViewManager";
import {
  demoteViewOnUserFilterEdit,
  type ExplicitFilterStateChange,
  type ViewDemotionControllers,
} from "@/src/features/events/lib/demoteViewOnUserFilterEdit";
import { useFullTextSearch } from "@/src/components/table/use-cases/useFullTextSearch";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import { useSelectAll } from "@/src/features/table/hooks/useSelectAll";
import { TableActionMenu } from "@/src/features/table/components/TableActionMenu";
import { type TableAction } from "@/src/features/table/types";
import { type DataTablePeekViewProps } from "@/src/components/table/peek";
import { useScoreColumns } from "@/src/features/scores/hooks/useScoreColumns";
import { scoreFilters } from "@/src/features/scores/lib/scoreColumns";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { useEventsTableData } from "@/src/features/events/hooks/useEventsTableData";
import {
  useAppRootDefault,
  useApplyAppRootFallback,
} from "@/src/features/events/hooks/useAppRootDefault";
import { getAppRootSavedViewComparisonFilters } from "@/src/features/events/lib/appRootDefaultFilterPolicy";
import { useEventsFilterOptions } from "@/src/features/events/hooks/useEventsFilterOptions";
import { getSafeRedirectPath } from "@/src/utils/redirect";
// Disabled for now because perhaps confusing
// import {
//   useEventsViewMode,
//   type EventsViewMode,
// } from "@/src/features/events/hooks/useEventsViewMode";
// import { EventsViewModeToggle } from "@/src/features/events/components/EventsViewModeToggle";
// import { useObservationCountCheck } from "@/src/features/events/hooks/useObservationCountCheck";
import {
  REFRESH_INTERVALS,
  type RefreshInterval,
} from "@/src/components/table/utils/refresh-intervals";
import useSessionStorage from "@/src/components/useSessionStorage";
import { api } from "@/src/utils/api";
import { RunEvaluationDialog } from "@/src/features/batch-actions/components/RunEvaluationDialog/index";
import { AddObservationsToDatasetDialog } from "@/src/features/batch-actions/components/AddObservationsToDatasetDialog/index";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { showSuccessToast } from "@/src/features/notifications";
import { useSearchBarEnabled } from "@/src/features/search-bar/hooks/useSearchBarEnabled";
import { useEventsSearchBar } from "@/src/features/search-bar/hooks/useEventsSearchBar";
import { EventsSearchBarRow } from "@/src/features/search-bar/components/EventsSearchBarRow";
import { MobileFullTextSearch } from "@/src/features/events/components/MobileFullTextSearch";
import { buildAiContext } from "@/src/features/search-bar/lib/ai-context";
import {
  observedScoreNamesFromOptions,
  toObservedOptions,
  withMetadataPathOptions,
} from "@/src/features/search-bar/lib/observed-options";
import { CategoryPresetChips } from "@/src/features/events/components/CategoryPresetChips";
import { TableViewPresetsDrawer } from "@/src/components/table/table-view-presets/components/data-table-view-presets-drawer";
import { EventsChartView } from "@/src/features/chart-view/EventsChartView";
import { ViewModeToggle } from "@/src/features/chart-view/components/ViewModeToggle";
import { useChartViewState } from "@/src/features/chart-view/lib/useChartViewState";
import { EventsOutlierStrip } from "@/src/features/events/components/outlier-strip/EventsOutlierStrip";
import {
  chartFilterExclusionReason,
  chartSearchFieldReason,
  CHART_SEARCH_QUERY_REASON,
} from "@/src/features/chart-view/lib/chartFilterCompatibility";
import { getEventsTableStatePolicy } from "@/src/features/events/lib/eventsTableStatePolicy";
import {
  useFacetOptionsWithObservedMetadata,
  useObservedMetadataPaths,
  useObservedMetadataRecorder,
} from "@/src/hooks/useObservedMetadata";
import { AddTracesToAnnotationQueueDialogController } from "@/src/features/annotation-queues/components/AddTracesToAnnotationQueueDialogController";

export type EventsTableRow = {
  // Identity fields
  id: string;
  traceId?: string;
  spanId: string;
  parentSpanId?: string;

  // Time fields
  startTime: Date;
  endTime?: Date;
  completionStartTime?: Date;
  timestamp?: Date;

  // Core properties
  type: ObservationType;
  name?: string;
  environment?: string;
  version?: string;
  release?: string;
  level?: ObservationLevelType;
  statusMessage?: string;

  // User context
  userId?: string;
  sessionId?: string;

  // Model fields
  providedModelName?: string;
  modelId?: string;
  modelParameters?: string;

  // Prompt fields
  promptId?: string;
  promptName?: string;
  promptVersion?: string;

  // Usage and cost
  usage: {
    inputUsage: number;
    outputUsage: number;
    totalUsage: number;
  };
  usageDetails: Record<string, number>;
  totalCost?: number;
  cost: {
    inputCost?: number;
    outputCost?: number;
  };
  costDetails: Record<string, number>;
  usagePricingTierName?: string | null;

  // Performance metrics
  latency?: number;
  timeToFirstToken?: number;

  // Tool fields
  toolDefinitions?: number;
  toolCalls?: number;

  input?: string;
  output?: string;
  metadata?: unknown;

  // Trace fields
  traceTags?: string[];
  traceName?: string;

  // Scores (level-agnostic: observation- and trace-level rolled up together)
  scores: ScoreAggregate;
};

export type EventsTableProps = {
  projectId: string;
  userId?: string;
  promptName?: string;
  promptVersion?: number;
  omittedFilter?: ObservationEventsOmittableFilterColumn[];
  hideControls?: boolean;
  // External control props for embedded preview tables
  externalFilterState?: FilterState;
  externalDateRange?: TableDateRange;
  limitRows?: number;
  sessionId?: string;
  /**
   * When true, render the time-range picker and auto-refresh button in the
   * page header (next to the title) via the header controls slot, instead of
   * inside the table toolbar. Only used when the table is the primary content
   * of a `Page`.
   */
  showControlsInPageHeader?: boolean;
  /** Explicit signal from the Fast Preview/v4 page routes. */
  enableAppRootDefault?: boolean;
  /**
   * Keep an embedded table's filters, search, and saved views independent from
   * the project-wide observations page. The project date range remains shared.
   */
  isolateTableState?: boolean;
};

// Build the start-time filters for an absolute date range (lower bound
// always, upper bound when present). Shared by the live table-rows range and the
// tick-decoupled facet-options range.
const toStartTimeFilterState = (range?: TableDateRange): TimeFilter[] =>
  range
    ? [
        {
          column: "startTime",
          type: "datetime",
          operator: ">=",
          value: range.from,
        },
        ...(range.to
          ? [
              {
                column: "startTime",
                type: "datetime",
                operator: "<=",
                value: range.to,
              } as const,
            ]
          : []),
      ]
    : [];

export default function ObservationsEventsTable({
  projectId,
  userId,
  promptName,
  promptVersion,
  omittedFilter = [],
  hideControls = false,
  externalFilterState,
  externalDateRange,
  limitRows,
  sessionId,
  showControlsInPageHeader = false,
  enableAppRootDefault = false,
  isolateTableState = false,
}: EventsTableProps) {
  const peekContext = usePeekTableState();
  const eventsFilterConfig = useMemo(
    () => getObservationEventsFilterConfig(omittedFilter),
    [omittedFilter],
  );

  const { setDetailPageList } = useDetailPageLists();
  const [selectedRows, setSelectedRows] = useState<RowSelectionState>({});
  const urlSearch = useFullTextSearch();
  const [isolatedSearchQuery, setIsolatedSearchQuery] = useState<string | null>(
    null,
  );
  const [isolatedSearchType, setIsolatedSearchType] = useState<
    TracingSearchType[]
  >(["id"]);
  const tableStatePolicy = getEventsTableStatePolicy({
    hideControls,
    isolateTableState,
  });
  const searchQuery = tableStatePolicy.useIsolatedSearch
    ? isolatedSearchQuery
    : urlSearch.searchQuery;
  const searchType = tableStatePolicy.useIsolatedSearch
    ? isolatedSearchType
    : urlSearch.searchType;
  const setSearchQuery: (query: string | null) => void =
    tableStatePolicy.useIsolatedSearch
      ? setIsolatedSearchQuery
      : urlSearch.setSearchQuery;
  const setSearchType: (type: TracingSearchType[]) => void =
    tableStatePolicy.useIsolatedSearch
      ? setIsolatedSearchType
      : urlSearch.setSearchType;

  const { selectAll, setSelectAll } = useSelectAll(projectId, "observations");
  const [showRunEvaluationDialog, setShowRunEvaluationDialog] = useState(false);
  const [showAddToDatasetDialog, setShowAddToDatasetDialog] = useState(false);

  const [paginationState, setPaginationState] = usePaginationState(1, 50);

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(
    "observations",
    "s",
  );

  const [orderByState, setOrderByState] = useOrderByState({
    column: "startTime",
    order: "DESC",
  });

  const { timeRange, setTimeRange } = useTableDateRange(projectId);

  // Disabled for now because perhaps confusing — replaced by "Is Root Observation"
  // boolean facet in the sidebar (see filter-config.ts).
  //
  // RE-ENABLING THE VIEW MODE TOGGLE:
  // To re-enable, uncomment the code below AND the viewModeFilter, viewModeToggle,
  // auto-switch logic, and imports further down. However, note that the sidebar now
  // has an "Is Root Observation" boolean facet for `isRootObservation`.
  // Having BOTH active would create duplicate/conflicting filters. Pick one:
  //   - Sidebar facet only (current): remove this commented code entirely
  //   - Toolbar toggle only: uncomment this code, remove the boolean facet from
  //     web/src/features/events/config/filter-config.ts, and scope filter options
  //     by the active view mode
  //   - Both: would need deduplication logic to prevent conflicting filters
  //
  // View mode toggle (Trace vs Observation)
  // const { viewMode, setViewMode: setViewModeRaw } =
  //   useEventsViewMode(projectId);
  //
  // const [userExplicitChoice, setUserExplicitChoice] =
  //   useSessionStorage<EventsViewMode | null>(
  //     `eventsViewModeUserChoice-${projectId}`,
  //     null,
  //   );
  //
  // const [autoSwitchedForRange, setAutoSwitchedForRange] = useSessionStorage<
  //   string | null
  // >(`eventsAutoSwitchRange-${projectId}`, null);
  //
  // const isRootObservation = viewMode === "trace" ? true : undefined;
  //
  // const setViewMode = useCallback(
  //   (mode: EventsViewMode) => {
  //     setUserExplicitChoice(mode);
  //     setViewModeRaw(mode);
  //     setPaginationState({ page: 1, limit: 50 });
  //   },
  //   [setUserExplicitChoice, setViewModeRaw, setPaginationState],
  // );

  // for auto data refresh
  const utils = api.useUtils();
  const [rawRefreshInterval, setRawRefreshInterval] =
    useSessionStorage<RefreshInterval>(
      `tableRefreshInterval-events-${projectId}`,
      null,
    );

  // Validate session storage value against allowed intervals
  const allowedValues = REFRESH_INTERVALS.map((i) => i.value);
  const refreshInterval = allowedValues.includes(rawRefreshInterval)
    ? rawRefreshInterval
    : null;
  const setRefreshInterval = useCallback(
    (value: RefreshInterval) => {
      if (allowedValues.includes(value)) {
        setRawRefreshInterval(value);
      }
    },
    [allowedValues, setRawRefreshInterval],
  );

  // When the chart/outlier-strip window (below) last advanced. Truncated to the
  // minute: a to-the-millisecond bound re-keyed the chart query on every tick,
  // and that cold load is what faded the strip out mid-refresh.
  const [chartRefreshedAtMs, setChartRefreshedAt] = useState(() =>
    startOfMinute(new Date()).getTime(),
  );

  // A refresh is invalidation only: rows, counts and facet options share one
  // anchored window (see useLiveTableDateRange), so every refetch reuses its
  // query key and updates in place instead of re-keying into a cold load. The
  // chart runs dashboard.executeQuery, which is invalidated alongside.
  const handleRefresh = useCallback(() => {
    setChartRefreshedAt(startOfMinute(new Date()).getTime());
    Promise.all([
      utils.events.all.invalidate(),
      utils.events.countAll.invalidate(),
      // Invalidate filterOptions too so the "Total ≈ X" count refreshes.
      utils.events.filterOptions.invalidate(),
      utils.dashboard.executeQuery.invalidate(),
    ]);
  }, [utils]);

  useEffect(() => {
    if (!refreshInterval) return;
    const id = setInterval(handleRefresh, refreshInterval);
    return () => clearInterval(id);
  }, [refreshInterval, handleRefresh]);

  const { range: tableDateRange, anchoredTo } =
    useLiveTableDateRange(timeRange);

  const dateRange = externalDateRange ?? tableDateRange;

  // Chart view ("any view is a chart"): URL-driven table↔chart toggle + config.
  // Only offered on the full (non-embedded) events surface, which is already
  // v4-only (the page mounts this table only for v4 users), so v1/legacy users
  // never see it. `chartEnabled` (computed below, once filterState exists) also
  // gates the chart off whenever the table's data can't be faithfully
  // reproduced by the aggregate query — free-text search, or any filter column
  // the query can't model — so the chart never silently disagrees with the
  // table.
  const {
    viewMode: chartViewMode,
    setViewMode: setChartViewMode,
    config: chartConfig,
    setConfig: setChartConfig,
  } = useChartViewState();
  // Unlike the table, the chart and the outlier strip need a CLOSED window. Both
  // ends are derived from the same length: the end is the later of the window's
  // anchor and the last refresh, and the start is measured back from that end —
  // never taken from the table's anchored `from`, which would let the window grow
  // between anchors, or invert once the user picks a range shorter than the time
  // since the last refresh.
  const chartTimeWindow = useMemo(() => {
    const anchorMs = anchoredTo?.getTime();
    const fromMs = dateRange?.from.getTime();
    const lengthMs =
      anchorMs !== undefined && fromMs !== undefined
        ? anchorMs - fromMs
        : 24 * 60 * 60 * 1000;
    const endMs = dateRange?.to
      ? dateRange.to.getTime()
      : Math.max(anchorMs ?? 0, chartRefreshedAtMs);

    return { from: new Date(endMs - lengthMs), to: new Date(endMs) };
  }, [dateRange, anchoredTo, chartRefreshedAtMs]);

  // Drill-in writes the clicked bucket as an absolute range. URL-only
  // (pushIn → browser Back restores the outer window) and deliberately NOT
  // persisted as the project's default range — a transient zoom must not
  // become tomorrow's baseline.
  const { setTimeRange: setTimeRangeTransient } = useTableDateRange(projectId, {
    persistAsDefault: false,
  });

  // Facets describe the whole window (see facetStartTimeFilter below); the paged
  // row/count queries take the pinned upper bound instead, so offset paging does
  // not repeat or skip rows while the window keeps taking in newly ingested ones.
  const { range: rowsDateRange, pinOnLeavingFirstPage } =
    usePaginationWindowPin(dateRange, limitRows ? 0 : paginationState.page - 1);
  const dateRangeFilter: FilterState = toStartTimeFilterState(rowsDateRange);

  const appRootDefault = useAppRootDefault({
    enabled: enableAppRootDefault,
    projectId,
  });

  // Late-bound view controllers for the demotion callback below: the filter
  // hook (and its onExplicitFilterStateChange) is created before
  // useTableViewManager runs, so reach the controllers through a ref (same
  // pattern as queryFilterRef).
  const viewControllersRef = useRef<ViewDemotionControllers | null>(null);

  const onAppRootExplicitFilterStateChange =
    appRootDefault.onExplicitFilterStateChange;

  // Composes the app-root default policy with the view demotion on user-origin
  // filter edits (LFE-14699).
  const onExplicitFilterStateChange = useCallback(
    (change: ExplicitFilterStateChange) => {
      onAppRootExplicitFilterStateChange(change);
      demoteViewOnUserFilterEdit(change, viewControllersRef.current);
    },
    [onAppRootExplicitFilterStateChange],
  );

  // Route-state half of the sidebar filters, ahead of the facet-options query
  // so the same state that scopes the rows can refine the counts (LFE-14489).
  const filterStateOptions: UseSidebarFilterStateOptions = useMemo(() => {
    const baseOptions = {
      implicitDefaultConfig: DEFAULT_SIDEBAR_IMPLICIT_ENVIRONMENT_CONFIG,
      defaultExplicitFilterState: appRootDefault.defaultExplicitFilterState,
      onExplicitFilterStateChange,
    };

    if (peekContext) {
      return {
        ...baseOptions,
        stateLocation: "peekContext",
        context: peekContext,
      };
    }

    if (tableStatePolicy.filterStateLocation === "memory") {
      return {
        ...baseOptions,
        stateLocation: "memory",
      };
    }

    return {
      ...baseOptions,
      stateLocation: "urlAndSessionStorage",
      sessionFilterContextId: buildSidebarFilterSessionContextId(
        projectId,
        userId ? "user" : sessionId ? "session" : undefined,
      ),
    };
  }, [
    tableStatePolicy.filterStateLocation,
    peekContext,
    projectId,
    userId,
    sessionId,
    appRootDefault.defaultExplicitFilterState,
    onExplicitFilterStateChange,
  ]);

  const filterCore = useSidebarFilterStateCore(
    eventsFilterConfig,
    filterStateOptions,
  );

  // Embed scoping (user/session detail tabs, prompt linked generations): these
  // conditions bound the row query, so they refine the facet counts too.
  const embedScopeFilterState: FilterState = useMemo(
    () => [
      ...(userId
        ? [
            {
              column: "User ID",
              type: "string" as const,
              operator: "=" as const,
              value: userId,
            },
          ]
        : []),
      ...(sessionId
        ? [
            {
              column: "Session ID",
              type: "string" as const,
              operator: "=" as const,
              value: sessionId,
            },
          ]
        : []),
      ...(promptName
        ? [
            {
              column: "promptName",
              type: "string" as const,
              operator: "=" as const,
              value: promptName,
            },
          ]
        : []),
      ...(promptVersion
        ? [
            {
              column: "promptVersion",
              type: "number" as const,
              operator: "=" as const,
              value: promptVersion,
            },
          ]
        : []),
    ],
    [userId, sessionId, promptName, promptVersion],
  );

  const facetRefiningFilter = useMemo(
    () =>
      externalFilterState ??
      filterCore.filterState.concat(embedScopeFilterState),
    [externalFilterState, filterCore.filterState, embedScopeFilterState],
  );
  // Same anchored window as the rows: the facets no longer need a tick-decoupled
  // range to survive an auto refresh, because the window itself no longer moves
  // tick to tick.
  const facetStartTimeFilter = useMemo(
    () => toStartTimeFilterState(dateRange),
    [dateRange],
  );

  // Fetch filter options. Lazy: start with the eagerly-visible facets and load
  // the rest (high-cardinality userId/sessionId, model/prompt/score facets) only
  // when a sidebar section is opened or a field is typed into the search bar.
  const {
    filterOptions,
    isFilterOptionsPending,
    approxTotalCount,
    isApproxTotalCountLoading,
    approxTotalCountIsPartialScope,
    erroredColumns,
    loadingColumns,
    requestColumns,
  } = useEventsFilterOptions({
    projectId,
    startTimeFilter: facetStartTimeFilter,
    refiningFilter: facetRefiningFilter,
    // "Total ≈ X" rides the facet scan (uniq(span_id) over facetRefiningFilter); skip for embedded/preview tables.
    includeApproxCount: !limitRows,
    lazy: true,
  });

  // Partial scope (over-counts) when the server dropped filters (input/output/comment) or a full-text search is active.
  const approxTotalCountIsPartial =
    approxTotalCountIsPartialScope ||
    Boolean(searchQuery && searchQuery.trim().length > 0);

  // The sidebar's Metadata facet suggests the same observed keys/values the
  // search bar does — one store, one projection (LFE-11030).
  const facetOptions = useFacetOptionsWithObservedMetadata(
    projectId,
    filterOptions,
  );

  const queryFilter = useSidebarFilterPresentation(
    filterCore,
    eventsFilterConfig,
    facetOptions,
    {
      loading: isFilterOptionsPending,
      loadingColumns,
      // v4 fast-mode surface — drives `isV4` on filters:* analytics (LFE-10781).
      isV4: true,
    },
  );
  const projectFiltersForSearchBar = queryFilter.projectFiltersForSearchBar;

  // Lazy filter-options: load a facet's values when its sidebar section is
  // expanded (also covers active filters, which auto-expand on mount). The
  // request set only grows, so re-collapsing never re-fetches.
  useEffect(() => {
    requestColumns(queryFilter.expanded);
  }, [queryFilter.expanded, requestColumns]);

  // Grammar search bar: an ADDITIONAL editor that coexists with the facet
  // sidebar, and the two stay in sync. Generally available on the v4 events
  // tables (no longer a per-user Feature Preview opt-in — useSearchBarEnabled()
  // is now always true). The sidebar's FilterState (+ the table's full-text
  // search) remains the single source of truth — the bar reads from and writes
  // to it. Only the legacy toolbar search field is replaced (full-text search —
  // bare text and content:/input:/output: — goes inline in the bar); the
  // sidebar and time/refresh controls stay.
  const searchBarEnabled = useSearchBarEnabled();
  const searchBarMode =
    searchBarEnabled &&
    !hideControls &&
    !externalFilterState &&
    !peekContext &&
    tableStatePolicy.allowGrammarSearch &&
    // Embedded user/session-detail tables are page-scoped (a userId/sessionId
    // filter is AND-combined into the query); the bar reads the full FIELDS
    // registry and would let e.g. `userId:other` fight that scope. Keep it to
    // full-page surfaces, matching the documented embedded opt-out.
    !userId &&
    !sessionId;

  // Create ref-based wrapper to avoid stale closure when queryFilter updates
  const queryFilterRef = useRef(queryFilter);
  queryFilterRef.current = queryFilter;

  const setFiltersWrapper = useCallback(
    (filters: FilterState) =>
      queryFilterRef.current?.setFilterState(filters, { origin: "user" }),
    [],
  );
  const setSavedViewFiltersWrapper = useCallback(
    (filters: FilterState) =>
      queryFilterRef.current?.setFilterState(filters, {
        origin: "saved_view",
      }),
    [],
  );

  // Metadata key paths are not server-enumerated: merge the persisted
  // per-project map of paths observed on previously loaded rows (recorded
  // below, once the table data hook provides the rows) into the observed
  // options, so `metadata.` completes with real keys and their types. The
  // sidebar's Metadata facet reads the same map (see facetOptions above).
  const observedMetadataPaths = useObservedMetadataPaths(projectId);

  const observedOptions = useMemo(
    () =>
      withMetadataPathOptions(
        toObservedOptions(filterOptions, isFilterOptionsPending),
        observedMetadataPaths,
      ),
    [filterOptions, isFilterOptionsPending, observedMetadataPaths],
  );

  const {
    store: searchBarStore,
    commit: searchBarCommit,
    applyFilters: searchBarApplyFilters,
  } = useEventsSearchBar({
    projectId,
    tableName: eventsFilterConfig.tableName,
    enabled: searchBarMode,
    filterState: queryFilter.searchBarFilterState,
    searchQuery,
    searchType,
    observed: observedOptions,
    setFilterState: setFiltersWrapper,
    setSearchQuery,
    setSearchType,
  });

  // Non-destructive preview: while a category-chip preset row is hovered or
  // focused, show the query it would apply as the store's preview overlay. The
  // draft is never touched, so ending the preview cannot lose in-progress
  // typing. Clicking still applies for real via applyViewState. No-op outside
  // search-bar mode.
  const previewViewInSearchBar = useCallback(
    (state: TableViewPresetState | null) => {
      if (!searchBarMode) return;
      const { actions } = searchBarStore.getState();
      if (state) {
        actions.setPreview(
          filterStateToQueryText(projectFiltersForSearchBar(state.filters))
            .text,
        );
      } else {
        actions.clearPreview();
      }
    },
    [searchBarMode, searchBarStore, projectFiltersForSearchBar],
  );

  // Disabled for now because perhaps confusing
  // const viewModeFilter: FilterState =
  //   viewMode === "trace"
  //     ? [
  //         {
  //           column: "isRootObservation",
  //           type: "boolean",
  //           operator: "=",
  //           value: true,
  //         },
  //       ]
  //     : [];

  // The sidebar's effective filter state is the single source of truth in both
  // modes — the search bar syncs into it, and the facet counts above refine
  // from the same state + embed scoping (LFE-14489).
  const combinedFilterState = queryFilter.effectiveFilterState
    .concat(dateRangeFilter)
    .concat(embedScopeFilterState);

  // Use external filter state if provided, otherwise use combined filter
  // state. Even with an external filter, still apply the date-range bound so
  // callers that pass an externalDateRange (e.g. the eval preview's "last 24
  // hours" window) have it honored for the row query, not just score columns.
  const filterState = externalFilterState
    ? externalFilterState.concat(dateRangeFilter)
    : combinedFilterState;

  // Offer the chart on the full (v4) surface — not embedded, not user/session
  // scoped. Unlike the old gate, an unsupported filter no longer HIDES the
  // chart: the chart forwards what it can and the sidebar + search bar mark the
  // rest as "not applied" (see chartFilterExclusions below).
  const chartEnabled = !hideControls && !userId && !sessionId;

  // Hide the strip where it would silently diverge from the table: prompt-version scope (not forwardable, no "not applied" affordance) or external date/filter pins.
  const outlierStripEnabled =
    chartEnabled &&
    promptVersion === undefined &&
    !externalDateRange &&
    !externalFilterState;

  // The chart is actually on screen (not just enabled). Only then do we mark
  // the filters it can't honour as "not applied", so table mode stays untouched.
  // Both surfaces use the stateless per-column / per-field reason resolvers
  // (chartFilterExclusionReason / chartSearchFieldReason) — a filter deactivates
  // in the sidebar and its search-bar pill identically.
  const chartActive = chartEnabled && chartViewMode === "chart";
  // Free-text search is never applied to the chart (it has no aggregate form).
  const chartFreeTextIgnored = chartActive && Boolean(searchQuery);

  // Use the custom hook for observations data fetching
  const {
    observations,
    totalCount,
    uniqueTraceCount,
    isTotalCountLoading,
    isTotalCountError,
    hasMore,
    handleAddToAnnotationQueue,
    isFetching,
    isIoPending,
    isSilencedError,
    usedAppRootFallback,
  } = useEventsTableData({
    projectId,
    filterState,
    paginationState: limitRows
      ? { page: 1, limit: limitRows }
      : paginationState,
    orderByState,
    searchQuery,
    searchType,
    selectedRows,
    selectAll,
    setSelectedRows,
    appRootFallbackEnabled: appRootDefault.isAutoManaged,
    // In chart mode the table is hidden and the chart runs its own aggregate
    // query — don't also run the expensive row + batched-I/O fetches.
    rowsEnabled: !chartActive,
    ioCharLimit: getRowHeightIOCharLimit(rowHeight),
  });

  useApplyAppRootFallback({
    additionalRowsFound: usedAppRootFallback,
    isAutoManaged: appRootDefault.isAutoManaged,
    filters: queryFilter.explicitFilterState,
    searchQuery,
    dateRange,
    setFilterState: queryFilter.setFilterState,
    removeSdkVersionCache: appRootDefault.removeSdkVersionCache,
  });

  // Disabled for now because perhaps confusing
  // === Auto-switch to observation mode when trace view is empty ===
  // (commented out along with view mode toggle)

  useEffect(() => {
    if (observations.status === "success") {
      setDetailPageList(
        detailPageListKeys.events,
        observations?.rows?.map((o) => ({
          id: o?.id,
          params: {
            traceId: o?.traceId || "",
            ...(o?.startTime ? { timestamp: o?.startTime.toISOString() } : {}),
          },
        })) ?? [],
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observations.status, observations.rows]);

  // Record the visible rows' metadata paths into the persisted per-project
  // suggestions map (read above into observedMetadataPaths). Same sampling as
  // the AI context below; runs once per fetch (rows identity). Not gated on the
  // search bar — the sidebar facet feeds from this map too — but embedded
  // PREVIEW tables (`hideControls`: 10 rows under an arbitrary external filter)
  // stay out: the per-key caps are drop-new-when-full, so a narrow preview's
  // keys would crowd out the ones the project actually browses.
  useObservedMetadataRecorder({
    projectId,
    rows: hideControls ? undefined : observations.rows,
  });

  // Project data context for the AI filter prompt: observed values (from
  // filterOptions) + metadata keys sampled from the visible rows + the current
  // result count, so the model maps NL onto real columns/values rather than
  // guessing (e.g. `type:chat`). Reuses already-loaded data; only when the bar
  // is active.
  const aiDataContext = useMemo(() => {
    if (!searchBarMode) return undefined;
    // totalCount is only computed on "select all"; use the loaded/visible row
    // count for the empty-vs-nonempty signal instead.
    return buildAiContext({
      observed: observedOptions,
      sampleMetadata: (observations.rows ?? [])
        .slice(0, 30)
        .map((o) => o.metadata),
      resultCount:
        observations.status === "success"
          ? (observations.rows?.length ?? 0)
          : null,
    });
  }, [searchBarMode, observedOptions, observations.rows, observations.status]);

  // Observed score names by column type for the AI endpoint's score-name
  // guardrail: the server validates/corrects the score keys the model returns
  // against these. Structured (not re-parsed from the flattened dataContext
  // above), and each set stays undefined until its filter-options column has
  // loaded, so an in-flight fetch never makes a real score name look unknown.
  const aiScoreNames = useMemo(
    () =>
      searchBarMode
        ? observedScoreNamesFromOptions(observedOptions)
        : undefined,
    [searchBarMode, observedOptions],
  );

  // Level-agnostic "Scores": one column group covering every score attached to
  // the trace (observation- AND trace-level). The row's `scores` aggregate is
  // rolled up server-side across both levels, so a trace-level score (e.g.
  // CSAT) shows here even on observation rows — matching the level-agnostic
  // score filter (LFE-10596). No separate "Trace Scores" group.
  const { scoreColumns, isLoading: isColumnLoading } =
    useScoreColumns<EventsTableRow>({
      scoreColumnKey: "scores",
      projectId,
      filter: scoreFilters.forTraceScopedAggregates(),
      fromTimestamp: dateRange?.from,
      defaultHidden: true,
    });

  const hasTraceDeletionEntitlement = useHasEntitlement("trace-deletion");

  const { selectActionColumn } = TableSelectionManager<EventsTableRow>({
    projectId,
    tableName: "observations",
    setSelectedRows,
    setSelectAll,
  });

  const traceDeleteMutation = api.traces.deleteMany.useMutation({
    onSuccess: () => {
      showSuccessToast({
        title: "Traces deleted",
        description:
          "Selected traces will be deleted. Traces are removed asynchronously and may continue to be visible for up to 15 minutes.",
      });
    },
    onSettled: () => {
      utils.events.all.invalidate();
      utils.events.countAll.invalidate();
      // Refresh filterOptions so the "Total ≈ X" count updates after a delete.
      utils.events.filterOptions.invalidate();
      utils.traces.all.invalidate();
    },
  });

  const selectedTraceIds = useMemo(() => {
    const visibleObservationsById = new Map(
      (observations.rows ?? []).map((observation) => [
        observation.id,
        observation,
      ]),
    );
    return [
      ...new Set(
        Object.keys(selectedRows)
          .map(
            (observationId) =>
              visibleObservationsById.get(observationId)?.traceId,
          )
          .filter((traceId): traceId is string => Boolean(traceId)),
      ),
    ];
  }, [observations.rows, selectedRows]);

  const handleDeleteTraces = async ({ projectId }: { projectId: string }) => {
    // Select-all deletes are dispatched even if paging or a background
    // refetch drained the visible-page selection to []: the batch path
    // deletes by query server-side and ignores traceIds. Only an id-based
    // delete with nothing resolvable is a no-op.
    if (!selectAll && selectedTraceIds.length === 0) return;

    await traceDeleteMutation.mutateAsync({
      projectId,
      traceIds: selectedTraceIds,
      query: {
        filter: filterState,
        orderBy: orderByState,
        searchQuery: searchQuery || undefined,
        searchType,
        // Declare the dispatching surface: these are events-view filters, so
        // the worker must read them from the events table. The server
        // validates the declaration (beta flag or instance preview opt-in).
        useEventsTable: true,
      },
      isBatchAction: selectAll,
    });
    setSelectedRows({});
  };

  // Confirmation counts for "Delete Traces": page selection counts directly;
  // select-all counts resolve lazily ("..." while loading) and the distinct
  // trace count is a ClickHouse `uniq` approximation, hence the "~".
  const selectedVisibleRowCount = (observations.rows ?? []).filter(
    (observation) => selectedRows[observation.id],
  ).length;
  const selectedItemCount = selectAll ? totalCount : selectedVisibleRowCount;
  const itemCountDisplay =
    selectedItemCount !== null
      ? compactNumberFormatter(selectedItemCount)
      : "...";
  const selectedUniqueTraceCount = selectAll
    ? uniqueTraceCount
    : selectedTraceIds.length;
  const traceCountDisplay =
    selectedUniqueTraceCount !== null
      ? `${selectAll ? "~" : ""}${compactNumberFormatter(selectedUniqueTraceCount)}`
      : "...";

  // Select-all deletes persist the raw filterState into the batch action, but
  // comment filters (commentCount/commentContent) resolve via Postgres at read
  // time and the worker cannot translate them into a ClickHouse query — the
  // server blocks such dispatches, so disable the action up front with a
  // clear reason.
  const hasCommentFilter = filterState.some(
    (f) => f.column === "commentCount" || f.column === "commentContent",
  );

  const isSelectAllCountUnavailable = isTotalCountLoading || isTotalCountError;
  const selectAllCountUnavailableReason = isTotalCountLoading
    ? "Counting selected observations."
    : isTotalCountError
      ? "Could not count selected observations. Clear selection and try again."
      : undefined;
  const tableActions: TableAction[] = [
    ...(hasTraceDeletionEntitlement
      ? [
          {
            id: ActionId.TraceDelete,
            type: BatchActionType.Delete,
            label: "Delete Traces",
            description: `${itemCountDisplay} ${selectedItemCount === 1 ? "item is" : "items are"} selected, spanning ${traceCountDisplay} unique ${selectedUniqueTraceCount === 1 ? "trace" : "traces"}. A trace is always deleted as a whole — if at least one of its observations is selected, all of its observations are deleted with it. This action cannot be undone. Trace deletion happens asynchronously and may take up to 24 hours.`,
            // Select-all is not gated on the visible-page selection: the
            // batch path deletes by query and ignores traceIds. Page
            // selection needs concrete trace IDs.
            disabled: selectAll
              ? hasCommentFilter
              : selectedTraceIds.length === 0,
            disabledReason:
              selectAll && hasCommentFilter
                ? "Batch deletion does not support comment filters. Remove the comment filter to delete."
                : "Selected observations are missing trace IDs.",
            // The server keys every trace-delete batch row under the traces
            // table (row id `${projectId}-traces-trace-delete`), whichever
            // view dispatched it — the events-vs-traces read routing travels
            // in the job's config.source, not in the table name. The shared
            // key allows only one active trace deletion per project across
            // the v3 and v4 views, and pointing the in-progress poll at it
            // lets this dialog see a deletion started from either view. This
            // must stay Traces at least as long as the v3 view exists.
            tableName: BatchExportTableName.Traces,
            accessCheck: {
              scope: "traces:delete",
              entitlement: "trace-deletion",
            },
            execute: handleDeleteTraces,
          } as TableAction,
        ]
      : []),
    {
      id: ActionId.ObservationAddToAnnotationQueue,
      type: BatchActionType.Create,
      label: "Add to Annotation Queue",
      description: `Add ${itemCountDisplay} selected observations to an annotation queue.`,
      customDialog: true,
      accessCheck: {
        scope: "annotationQueues:CUD",
      },
    },
    {
      id: ActionId.ObservationAddToDataset,
      type: BatchActionType.Create,
      label: "Add to Dataset",
      description: "Add selected observations to a dataset",
      customDialog: true,
      disabled: isSelectAllCountUnavailable,
      disabledReason: selectAllCountUnavailableReason,
      accessCheck: {
        scope: "datasets:CUD",
      },
    },
    {
      id: ActionId.ObservationBatchEvaluation,
      type: BatchActionType.Create,
      label: "Evaluate",
      description: "Run evaluations on selected observations.",
      customDialog: true,
      icon: <LightbulbIcon className="h-4 w-4 sm:mr-2" />,
      disabled: isSelectAllCountUnavailable,
      disabledReason: selectAllCountUnavailableReason,
      accessCheck: {
        scope: "evaluationRule:CUD",
      },
    },
  ];

  // Mobile collapses the whole toolbar away, so the batch-action surface (the
  // action menu + select-all banner it hosts) is gone — orphan selection
  // checkboxes would do nothing. Omit the select column on mobile until a
  // dedicated mobile action affordance exists.
  const isMobile = useIsMobile();
  const enableSorting = !hideControls;

  const columns: LangfuseColumnDef<EventsTableRow>[] = [
    ...(hideControls || isMobile ? [] : [selectActionColumn]),
    createDateTableColumn<EventsTableRow>({
      accessorKey: "startTime",
      header: getEventsColumnName("startTime"),
      size: 150,
      enableHiding: true,
      enableSorting,
    }),
    createItemBadgeTableColumn<EventsTableRow>({
      accessorKey: "type",
      header: getEventsColumnName("type"),
      size: 50,
      enableSorting,
    }),
    createTextTableColumn<EventsTableRow>({
      accessorKey: "name",
      header: getEventsColumnName("name"),
      size: 150,
      enableSorting,
    }),
    createTextTableColumn<EventsTableRow>({
      accessorKey: "traceName",
      header: getEventsColumnName("traceName"),
      size: 150,
      enableSorting: true,
    }),
    createIOTableColumn<EventsTableRow>({
      accessorKey: "input",
      header: getEventsColumnName("input"),
      size: 300,
      getCell: (value, { row }) =>
        isIoPending(row.original.id) ? { type: "loading" } : value || undefined,
      singleLine: rowHeight === "s",
      enableHiding: true,
    }),
    createIOTableColumn<EventsTableRow>({
      accessorKey: "output",
      header: getEventsColumnName("output"),
      size: 300,
      getCell: (value, { row }) =>
        isIoPending(row.original.id) ? { type: "loading" } : value || undefined,
      singleLine: rowHeight === "s",
      variant: "output",
      enableHiding: true,
    }),
    createIOTableColumn<EventsTableRow>({
      accessorKey: "metadata",
      header: "Metadata",
      size: 300,
      headerTooltip: {
        description: "Add metadata to traces to track additional information.",
        href: "https://langfuse.com/docs/observability/features/metadata",
      },
      getCell: (value, { row }) =>
        isIoPending(row.original.id) ? { type: "loading" } : value || undefined,
      singleLine: rowHeight === "s",
      enableHiding: true,
    }),
    createStatusTableColumn<EventsTableRow, ObservationLevelType>({
      accessorKey: "level",
      header: getEventsColumnName("level"),
      size: 100,
      headerTooltip: {
        description:
          "You can differentiate the importance of observations with the level attribute to control the verbosity of your traces and highlight errors and warnings.",
        href: "https://langfuse.com/docs/observability/features/log-levels",
      },
      enableHiding: true,
      enableSorting,
      isLive: false,
      getStatus: (level) =>
        level ? getObservationLevelStatus(level) : undefined,
    }),
    createIOTableColumn<EventsTableRow>({
      accessorKey: "statusMessage",
      header: getEventsColumnName("statusMessage"),
      size: 150,
      headerTooltip: {
        description:
          "Use a statusMessage to e.g. provide additional information on a status such as level=ERROR.",
        href: "https://langfuse.com/docs/observability/features/log-levels",
      },
      enableHiding: true,
      defaultHidden: true,
      getCell: (value) => value || undefined,
      singleLine: rowHeight === "s",
    }),
    createDurationTableColumn<EventsTableRow>({
      accessorKey: "latency",
      header: getEventsColumnName("latency"),
      size: 100,
      enableHiding: true,
      enableSorting,
    }),
    {
      accessorKey: "totalCost",
      header: getEventsColumnName("totalCost"),
      id: "totalCost",
      size: 120,
      cell: ({ row }) => {
        const value: number | undefined = row.getValue("totalCost");
        const type = row.original.type;

        if (!isObservationCostDisplayable(value, type)) {
          return <span>{formatObservationCost(value, type)}</span>;
        }

        return (
          <BreakdownTooltip
            details={row.original.costDetails}
            isCost
            pricingTierName={row.original.usagePricingTierName ?? undefined}
          >
            <div className="flex items-center gap-1">
              <span>{usdFormatter(value)}</span>
              <InfoIcon className="h-3 w-3" />
            </div>
          </BreakdownTooltip>
        );
      },
      enableHiding: true,
      enableSorting,
    },
    {
      accessorKey: "cost",
      header: "Cost",
      id: "cost",
      enableHiding: true,
      defaultHidden: true,
      cell: () => {
        return observations.status === "loading" ? (
          <Skeleton className="h-4 w-1/2" />
        ) : null;
      },
      columns: [
        createTextTableColumn<EventsTableRow>({
          accessorFn: (row) =>
            formatObservationCost(row.cost.inputCost, row.type),
          id: "inputCost",
          header: getEventsColumnName("inputCost"),
          size: 120,
          enableHiding: true,
          defaultHidden: true,
          enableSorting,
        }),
        createNumberTableColumn<EventsTableRow>({
          accessorFn: (row) => getCachedInputCost(row.costDetails),
          id: "cachedInputCost",
          header: getEventsColumnName("cachedInputCost"),
          size: 140,
          enableHiding: true,
          defaultHidden: true,
          enableSorting,
          formatter: (value) => usdFormatter(value),
          emptyValue: "-",
        }),
        createTextTableColumn<EventsTableRow>({
          accessorFn: (row) =>
            formatObservationCost(row.cost.outputCost, row.type),
          id: "outputCost",
          header: getEventsColumnName("outputCost"),
          size: 120,
          enableHiding: true,
          defaultHidden: true,
          enableSorting,
        }),
      ] satisfies LangfuseColumnDef<EventsTableRow>[],
    },
    createNumberTableColumn<EventsTableRow>({
      accessorKey: "toolDefinitions",
      header: getEventsColumnName("toolDefinitions"),
      size: 120,
      enableHiding: true,
      enableSorting,
      defaultHidden: true,
      formatter: (value) => numberFormatter(value, 0, 0),
    }),
    createNumberTableColumn<EventsTableRow>({
      accessorKey: "toolCalls",
      header: getEventsColumnName("toolCalls"),
      size: 100,
      enableHiding: true,
      enableSorting,
      defaultHidden: true,
      formatter: (value) => numberFormatter(value, 0, 0),
    }),
    {
      accessorKey: "timeToFirstToken",
      id: "timeToFirstToken",
      header: getEventsColumnName("timeToFirstToken"),
      size: 150,
      enableHiding: true,
      enableSorting,
      cell: ({ row }) => {
        const timeToFirstToken: number | undefined =
          row.getValue("timeToFirstToken");

        return (
          <span>
            {timeToFirstToken ? formatIntervalSeconds(timeToFirstToken) : "-"}
          </span>
        );
      },
    },
    {
      accessorKey: "usage",
      header: "Usage",
      id: "usage",
      enableHiding: true,
      defaultHidden: true,
      cell: () => {
        return observations.status === "loading" ? (
          <Skeleton className="h-4 w-1/2" />
        ) : null;
      },
      columns: [
        createNumberTableColumn<EventsTableRow>({
          accessorFn: (row) => {
            const { latency, usage } = row;
            if (latency === undefined) return undefined;
            if (usage.outputUsage === 0 && usage.totalUsage === 0)
              return undefined;
            if (!usage.outputUsage || !latency) return undefined;

            return Number((usage.outputUsage / latency).toFixed(1));
          },
          id: "tokensPerSecond",
          header: "Tokens per second",
          size: 200,
          formatter: (value) => String(value),
          defaultHidden: true,
          enableHiding: true,
          enableSorting,
        }),
        createNumberTableColumn<EventsTableRow>({
          id: "inputTokens",
          accessorFn: (row) => row.usage.inputUsage,
          header: getEventsColumnName("inputTokens"),
          size: 100,
          enableHiding: true,
          defaultHidden: true,
          enableSorting,
          formatter: (value) => numberFormatter(value, 0, 0),
        }),
        createNumberTableColumn<EventsTableRow>({
          accessorFn: (row) => getCachedInputMetric(row.usageDetails),
          id: "cachedInputTokens",
          header: getEventsColumnName("cachedInputTokens"),
          size: 140,
          enableHiding: true,
          defaultHidden: true,
          enableSorting,
          formatter: (value) => numberFormatter(value, 0, 0),
        }),
        createNumberTableColumn<EventsTableRow>({
          id: "outputTokens",
          accessorFn: (row) => row.usage.outputUsage,
          header: getEventsColumnName("outputTokens"),
          size: 100,
          enableHiding: true,
          defaultHidden: true,
          enableSorting,
          formatter: (value) => numberFormatter(value, 0, 0),
        }),
        createNumberTableColumn<EventsTableRow>({
          id: "totalTokens",
          accessorFn: (row) => row.usage.totalUsage,
          header: getEventsColumnName("totalTokens"),
          size: 100,
          enableHiding: true,
          defaultHidden: true,
          enableSorting,
          formatter: (value) => numberFormatter(value, 0, 0),
        }),
      ] satisfies LangfuseColumnDef<EventsTableRow>[],
    },
    {
      accessorKey: "providedModelName",
      id: "providedModelName",
      header: getEventsColumnName("providedModelName"),
      size: 150,
      enableHiding: true,
      enableSorting,
      cell: ({ row }) => {
        const model = row.getValue("providedModelName") as string;
        const modelId = row.getValue("modelId") as string | undefined;

        return (
          <ProvidedModelNameCell
            modelName={model}
            modelId={modelId}
            projectId={projectId}
            usageDetails={row.original.usageDetails}
          />
        );
      },
    },
    createIdTableColumn<EventsTableRow>({
      accessorKey: "promptName",
      header: getEventsColumnName("promptName"),
      headerTooltip: {
        description: "Link to prompt version in Langfuse prompt management.",
        href: "https://langfuse.com/docs/prompt-management/get-started",
      },
      size: 200,
      enableHiding: true,
      enableSorting,
      getValue: (_value, { row }) => {
        const promptName = row.original.promptName;
        const promptVersion = row.original.promptVersion;
        return promptName && promptVersion
          ? `${promptName} (v${promptVersion})`
          : undefined;
      },
    }),
    createBadgeTableColumn<EventsTableRow>({
      accessorKey: "environment",
      header: getEventsColumnName("environment"),
      size: 150,
      enableHiding: true,
    }),
    createTagsTableColumn<EventsTableRow>({
      accessorKey: "traceTags",
      header: getEventsColumnName("traceTags"),
      size: 250,
      enableHiding: true,
      shouldWrap: rowHeight !== "s",
    }),
    {
      accessorKey: "scores",
      header: "Scores",
      id: "scores",
      enableHiding: true,
      defaultHidden: true,
      cell: () => {
        return isColumnLoading ? <Skeleton className="h-4 w-1/2" /> : null;
      },
      columns: scoreColumns,
    },
    createDateTableColumn<EventsTableRow>({
      accessorKey: "endTime",
      header: getEventsColumnName("endTime"),
      size: 150,
      enableHiding: true,
      enableSorting,
      defaultHidden: true,
    }),
    createIdTableColumn<EventsTableRow>({
      accessorKey: "traceId",
      header: getEventsColumnName("traceId"),
      size: 100,
      enableSorting,
      enableHiding: true,
      defaultHidden: true,
    }),
    createIdTableColumn<EventsTableRow>({
      accessorKey: "modelId",
      header: getEventsColumnName("modelId"),
      size: 100,
      enableHiding: true,
      defaultHidden: true,
    }),
    createTextTableColumn<EventsTableRow>({
      accessorKey: "version",
      header: getEventsColumnName("version"),
      size: 100,
      headerTooltip: {
        description: "Track changes via the version tag.",
        href: "https://langfuse.com/docs/experimentation",
      },
      enableHiding: true,
      enableSorting,
      defaultHidden: true,
    }),
    createTextTableColumn<EventsTableRow>({
      accessorKey: "release",
      header: getEventsColumnName("release"),
      size: 100,
      headerTooltip: {
        description: "Track changes to your application via the release tag.",
        href: "https://langfuse.com/docs/observability/features/releases-and-versioning",
      },
      enableHiding: true,
      enableSorting,
      defaultHidden: true,
    }),
    createIdTableColumn<EventsTableRow>({
      accessorKey: "userId",
      header: getEventsColumnName("userId"),
      size: 150,
      enableHiding: true,
      defaultHidden: true,
    }),
    createIdTableColumn<EventsTableRow>({
      accessorKey: "sessionId",
      header: getEventsColumnName("sessionId"),
      size: 150,
      enableHiding: true,
      defaultHidden: true,
    }),
  ];

  const [columnVisibility, setColumnVisibilityState] =
    useColumnVisibility<EventsTableRow>(
      `eventsColumnVisibility-${projectId}`,
      columns,
    );

  const [columnOrder, setColumnOrder] = useColumnOrder<EventsTableRow>(
    `eventsColumnOrder-${projectId}`,
    columns,
  );

  const peekNavigationProps = usePeekNavigation({
    queryParams: ["observation", "display", "timestamp", "traceId"],
    tableName: eventsFilterConfig.tableName,
    isV4: true,
    paramsToMirrorPeekValue: ["observation"],
    extractParamsValuesFromRow: (row: EventsTableRow) => ({
      traceId: row.traceId || "",
      timestamp: row.timestamp?.toISOString() || "",
    }),
    expandConfig: {
      basePath: `/project/${projectId}/traces`,
      pathParam: "traceId",
    },
  });

  const { isLoading: isViewLoading, ...viewControllers } = useTableViewManager({
    tableName: TableViewPresetTableName.ObservationsEvents,
    projectId,
    stateUpdaters: {
      setOrderBy: setOrderByState,
      setFilters: setSavedViewFiltersWrapper,
      setExpandedFilters: queryFilter.onExpandedChange,
      setColumnOrder: setColumnOrder,
      setColumnVisibility: setColumnVisibilityState,
      setSearchQuery: setSearchQuery,
    },
    validationContext: {
      columns,
      filterColumnDefinition: eventsFilterConfig.columnDefinitions,
      expandableFilterColumns: eventsFilterConfig.facets.map(
        (facet) => facet.column,
      ),
      migrateFilterState: eventsFilterConfig.migrateFilterState,
    },
    currentFilterState: getAppRootSavedViewComparisonFilters(
      queryFilter.explicitFilterState,
      appRootDefault.isAutoManaged,
    ),
    currentExpandedFilters: queryFilter.expanded,
    disabled: tableStatePolicy.disableSavedViews,
    allowBackendSystemPresets: true,
  });
  viewControllersRef.current = viewControllers;

  const peekConfig: DataTablePeekViewProps | undefined = useMemo(() => {
    if (hideControls) return undefined;
    return {
      itemType: "TRACE",
      detailNavigationKey: detailPageListKeys.events,
      ...peekNavigationProps,
    };
  }, [peekNavigationProps, hideControls]);

  const rows: EventsTableRow[] = useMemo(() => {
    const result =
      observations.status === "success" && observations.rows
        ? observations.rows.map((observation) => {
            return {
              id: observation.id,
              traceId: observation.traceId ?? undefined,
              type: observation.type ?? undefined,
              spanId: observation.id, // span_id maps to id
              parentSpanId: observation.parentObservationId ?? undefined,
              startTime: observation.startTime,
              endTime: observation.endTime ?? undefined,
              timeToFirstToken: observation.timeToFirstToken ?? undefined,
              scores: observation.scores ?? {},
              latency: observation.latency ?? undefined,
              totalCost: observation.totalCost ?? undefined,
              cost: {
                inputCost: observation.inputCost ?? undefined,
                outputCost: observation.outputCost ?? undefined,
              },
              name: observation.name ?? undefined,
              version: observation.version ?? "",
              release: observation.release ?? "",
              providedModelName: observation.model ?? "",
              modelId: observation.internalModelId ?? undefined,
              level: observation.level,
              statusMessage: observation.statusMessage ?? undefined,
              usage: {
                inputUsage: observation.inputUsage,
                outputUsage: observation.outputUsage,
                totalUsage: observation.totalUsage,
              },
              promptId: observation.promptId ?? undefined,
              promptName: observation.promptName ?? undefined,
              promptVersion: observation.promptVersion?.toString() ?? undefined,
              traceTags: observation.traceTags ?? undefined,
              traceName: observation.traceName ?? undefined,
              timestamp: observation.startTime ?? undefined,
              usageDetails: observation.usageDetails ?? {},
              costDetails: observation.costDetails ?? {},
              usagePricingTierName:
                observation.usagePricingTierName ?? undefined,
              environment: observation.environment ?? undefined,
              // I/O data comes from joined data already
              input: observation.input
                ? typeof observation.input === "string"
                  ? observation.input
                  : JSON.stringify(observation.input)
                : undefined,
              output: observation.output
                ? typeof observation.output === "string"
                  ? observation.output
                  : JSON.stringify(observation.output)
                : undefined,
              metadata: observation.metadata,
              userId: observation.userId ?? undefined,
              sessionId: observation.sessionId ?? undefined,
              completionStartTime: observation.completionStartTime ?? undefined,
              toolDefinitions: observation.toolDefinitions
                ? Object.keys(observation.toolDefinitions).length
                : undefined,
              toolCalls: observation.toolCalls
                ? observation.toolCalls.length
                : undefined,
            };
          })
        : [];

    return result;
  }, [observations]);

  const selectedObservationIds = useMemo(() => {
    const rowIds = new Set(observations.rows?.map((o) => o.id));
    return Object.keys(selectedRows).filter((id) => rowIds.has(id));
  }, [observations.rows, selectedRows]);

  const selectedObservationCount = selectAll
    ? totalCount
    : selectedObservationIds.length;

  const exampleObservation = useMemo(() => {
    const firstId = selectedObservationIds[0];
    const firstObs = observations.rows?.find((o) => o.id === firstId);
    return {
      id: firstObs?.id ?? "",
      traceId: firstObs?.traceId ?? "",
      startTime: firstObs?.startTime ?? undefined,
    };
  }, [selectedObservationIds, observations.rows]);

  const refreshConfig = {
    onRefresh: handleRefresh,
    isRefreshing: isFetching,
    interval: refreshInterval,
    setInterval: setRefreshInterval,
  };

  // Mobile collapses the whole toolbar into one Filters bottom sheet. Desktop
  // (≥768px) is byte-identical to before — everything below is gated on
  // `isMobile`, declared above near the column list.
  // Count shown on the mobile Filters trigger. Same source as the desktop
  // rail's active-facet count — distinct filtered COLUMNS (a facet can emit
  // several FilterState entries) — plus free-text search, which now also lives
  // in the sheet.
  const mobileActiveFilterCount =
    new Set(
      (queryFilter.explicitFilterState ?? []).map((filter) => filter.column),
    ).size + (searchQuery && searchQuery.trim().length > 0 ? 1 : 0);

  return (
    <DataTableControlsProvider tableName={eventsFilterConfig.tableName}>
      <div className="flex h-full w-full flex-col">
        {showControlsInPageHeader && !hideControls && !isMobile && (
          <TableHeaderControls
            timeRange={timeRange}
            setTimeRange={setTimeRange}
            refresh={refreshConfig}
          />
        )}
        {/* Mobile: a single toolbar row — Filters(N) sheet trigger + view-mode
            toggle. Search, time range, preset chips, saved views and the facet
            sidebar all move INTO the sheet (same controllers, hosted there).
            Columns / row-height / export are omitted on the card list. */}
        {!hideControls && isMobile && (
          <div className="my-2 flex items-center gap-2 px-2">
            <MobileFiltersSheet
              activeCount={mobileActiveFilterCount}
              resultCount={totalCount}
              onClearAll={() => {
                queryFilter.clearAll();
                setSearchQuery("");
              }}
              search={
                searchBarMode ? (
                  <EventsSearchBarRow
                    projectId={projectId}
                    tableName={eventsFilterConfig.tableName}
                    store={searchBarStore}
                    commit={searchBarCommit}
                    observed={observedOptions}
                    erroredColumns={erroredColumns}
                    fieldReason={
                      chartActive ? chartSearchFieldReason : undefined
                    }
                    freeTextReason={
                      chartFreeTextIgnored
                        ? CHART_SEARCH_QUERY_REASON
                        : undefined
                    }
                    onApplyFilters={searchBarApplyFilters}
                    onRequestColumns={requestColumns}
                    aiDataContext={aiDataContext}
                    aiScoreNames={aiScoreNames}
                    // Flush inside the sheet: the section container owns the
                    // padding, so the bar lines up with time range / presets.
                    className="p-0"
                  />
                ) : (
                  // No grammar bar (userId/sessionId-scoped tables): fall back
                  // to the legacy full-text search so mobile keeps the search
                  // desktop has via the toolbar's searchConfig (LFE-11067).
                  <MobileFullTextSearch
                    currentQuery={searchQuery ?? undefined}
                    updateQuery={setSearchQuery}
                    tableAllowsFullTextSearch
                    metadataSearchFields={["ID", "Name", "Trace Name", "Model"]}
                    tableName={eventsFilterConfig.tableName}
                    isV4
                  />
                )
              }
              headerControls={
                // Compact time-range + refresh, pulled up into the sheet's
                // header row so the body is a single uninterrupted scroll.
                <div className="flex min-w-0 items-center gap-1">
                  <TimeRangePicker
                    compact
                    timeRange={timeRange}
                    onTimeRangeChange={setTimeRange}
                    timeRangePresets={TABLE_AGGREGATION_OPTIONS}
                    className="my-0"
                  />
                  <DataTableRefreshButton
                    compact
                    onRefresh={refreshConfig.onRefresh}
                    isRefreshing={refreshConfig.isRefreshing}
                    interval={refreshConfig.interval}
                    setInterval={refreshConfig.setInterval}
                  />
                </div>
              }
              presets={
                tableStatePolicy.disableSavedViews ? undefined : (
                  <CategoryPresetChips
                    projectId={projectId}
                    // URL viewId only — the sessionStorage appliedViewId can
                    // go stale under explicit URL state and light the wrong
                    // chip (see demoteViewOnUserFilterEdit).
                    activeViewId={viewControllers.selectedViewId}
                    onApplyView={viewControllers.handleSetViewId}
                    applyViewState={viewControllers.applyViewState}
                    onPreviewView={previewViewInSearchBar}
                  />
                )
              }
              savedViews={
                tableStatePolicy.disableSavedViews ? undefined : (
                  <TableViewPresetsDrawer
                    viewConfig={{
                      tableName: TableViewPresetTableName.ObservationsEvents,
                      projectId,
                      controllers: viewControllers,
                    }}
                    currentState={{
                      orderBy: orderByState ?? null,
                      filters: queryFilter.explicitFilterState ?? [],
                      columnOrder,
                      columnVisibility,
                      searchQuery: searchQuery ?? "",
                    }}
                  />
                )
              }
              facets={
                <DataTableControls
                  key={viewControllers.selectedViewId ?? "no-view"}
                  queryFilter={queryFilter}
                  filterWithAI={!searchBarMode}
                  blockedColumnReason={
                    chartActive ? chartFilterExclusionReason : undefined
                  }
                  // inline: flow at natural height in the sheet's single scroll
                  // (no internal ScrollArea). Desktop sidebar stays default.
                  layout="inline"
                />
              }
            />
            {chartEnabled && (
              <ViewModeToggle
                mode={chartViewMode}
                onModeChange={setChartViewMode}
              />
            )}
          </div>
        )}
        {!hideControls && !isMobile && (
          <div
            className={cn(
              // This is a table-internal sticky band below PageHeader. Using
              // top-banner-offset here pushes the band down by the viewport
              // header/banner offset and leaves a large blank gap above it.
              // pb-1.5 gives the band a bit more breathing room above the table.
              searchBarMode && "bg-background sticky top-0 z-30 pb-1.5",
            )}
          >
            {/* Search bar row: full-width query composer. In bar mode it sticks
                together with the toolbar below, so the toolbar controls cannot
                scroll underneath and render half-clipped. When
                showControlsInPageHeader is set (the standalone traces/
                observations pages), time-range + refresh are hoisted to the
                page header via TableHeaderControls; otherwise they remain in
                the toolbar row below. */}
            {searchBarMode && (
              <EventsSearchBarRow
                projectId={projectId}
                tableName={eventsFilterConfig.tableName}
                store={searchBarStore}
                commit={searchBarCommit}
                observed={observedOptions}
                erroredColumns={erroredColumns}
                fieldReason={chartActive ? chartSearchFieldReason : undefined}
                freeTextReason={
                  chartFreeTextIgnored ? CHART_SEARCH_QUERY_REASON : undefined
                }
                onApplyFilters={searchBarApplyFilters}
                onRequestColumns={requestColumns}
                aiDataContext={aiDataContext}
                aiScoreNames={aiScoreNames}
              />
            )}
            {/* Toolbar spanning full width */}
            <DataTableToolbar
              columns={columns}
              rowClassName={searchBarMode ? "my-1" : undefined}
              filterState={queryFilter.explicitFilterState}
              tableName={eventsFilterConfig.tableName}
              isV4={true}
              searchConfig={
                // In search-bar mode full-text search (bare text +
                // content:/input:/output:) lives inline in the bar, so the
                // legacy toolbar search field is hidden.
                searchBarMode
                  ? undefined
                  : {
                      metadataSearchFields: [
                        "ID",
                        "Name",
                        "Trace Name",
                        "Model",
                      ],
                      updateQuery: setSearchQuery,
                      currentQuery: searchQuery ?? undefined,
                      searchType,
                      setSearchType,
                      tableAllowsFullTextSearch: true,
                    }
              }
              // In bar mode the toolbar search field is hidden, so source the
              // saved-view search query from the live URL state (the bar writes
              // free text there) rather than the toolbar's empty local mirror.
              currentSearchQuery={
                searchBarMode ? (searchQuery ?? "") : undefined
              }
              columnsWithCustomSelect={[
                "providedModelName",
                "name",
                "promptName",
              ]}
              columnVisibility={columnVisibility}
              setColumnVisibility={setColumnVisibilityState}
              columnOrder={columnOrder}
              setColumnOrder={setColumnOrder}
              orderByState={orderByState}
              rowHeight={rowHeight}
              setRowHeight={setRowHeight}
              timeRange={showControlsInPageHeader ? undefined : timeRange}
              setTimeRange={showControlsInPageHeader ? undefined : setTimeRange}
              viewModeToggle={
                chartEnabled ? (
                  <ViewModeToggle
                    mode={chartViewMode}
                    onModeChange={setChartViewMode}
                  />
                ) : undefined
              }
              refreshConfig={
                showControlsInPageHeader ? undefined : refreshConfig
              }
              actionButtons={[
                <BatchExportTableButton
                  {...{
                    projectId,
                    filterState,
                    orderByState,
                    searchQuery,
                    searchType,
                  }}
                  tableName={BatchExportTableName.Events}
                  key="batchExport"
                />,
                !chartActive &&
                (selectedObservationIds.length > 0 || selectAll) ? (
                  <AddTracesToAnnotationQueueDialogController
                    key="observations-multi-select-actions"
                    projectId={projectId}
                    actionId={ActionId.ObservationAddToAnnotationQueue}
                    tableName={BatchExportTableName.Events}
                    alternateTableName={BatchExportTableName.Observations}
                    objectLabel="observations"
                    description={`Add ${itemCountDisplay} selected observations to an annotation queue.`}
                    onAddToQueue={handleAddToAnnotationQueue}
                    onSuccess={() => {
                      setSelectedRows({});
                      setSelectAll(false);
                    }}
                  >
                    {({ openDialog }) => (
                      <TableActionMenu
                        projectId={projectId}
                        actions={tableActions}
                        tableName={BatchExportTableName.Observations}
                        selectedCount={selectedObservationCount}
                        onClearSelection={() => {
                          setSelectedRows({});
                          setSelectAll(false);
                        }}
                        onCustomAction={(actionType) => {
                          if (
                            actionType ===
                            ActionId.ObservationAddToAnnotationQueue
                          ) {
                            openDialog();
                          }
                          if (
                            actionType === ActionId.ObservationBatchEvaluation
                          ) {
                            setShowRunEvaluationDialog(true);
                          }
                          if (actionType === ActionId.ObservationAddToDataset) {
                            setShowAddToDatasetDialog(true);
                          }
                        }}
                      />
                    )}
                  </AddTracesToAnnotationQueueDialogController>
                ) : null,
              ]}
              // No row selection in chart mode — the table (and its select-all
              // banner) is hidden, so a stale selection must not keep the batch
              // menu (incl. Delete) operable. The selection is preserved and
              // reappears on switching back to Table.
              multiSelect={
                chartActive
                  ? undefined
                  : {
                      selectAll,
                      setSelectAll,
                      selectedRowIds: selectedObservationIds,
                      setRowSelection: setSelectedRows,
                      totalCount,
                      // totalCount stays null until select-all triggers the lazy
                      // count query; hasNextPage lets the select-all banner show
                      // without an eager count over the events table.
                      hasNextPage: hasMore,
                      pageSize: paginationState.limit,
                      pageIndex: paginationState.page - 1,
                    }
              }
              // In bar mode AI filtering lives in the search bar ("Ask AI"),
              // so the legacy wand is only offered when the bar is absent.
              filterWithAI={!searchBarMode}
              // Category-preset chips + "My Views" pill share the toolbar row,
              // left-aligned, so they sit on the same line as the right-aligned
              // Columns/Export controls.
              leadingControls={
                tableStatePolicy.disableSavedViews ? undefined : (
                  <div className="flex flex-wrap items-center gap-2">
                    <CategoryPresetChips
                      projectId={projectId}
                      // URL viewId only — the sessionStorage appliedViewId
                      // can go stale under explicit URL state and light the
                      // wrong chip (see demoteViewOnUserFilterEdit).
                      activeViewId={viewControllers.selectedViewId}
                      onApplyView={viewControllers.handleSetViewId}
                      applyViewState={viewControllers.applyViewState}
                      onPreviewView={previewViewInSearchBar}
                    />
                    <TableViewPresetsDrawer
                      viewConfig={{
                        tableName: TableViewPresetTableName.ObservationsEvents,
                        projectId,
                        controllers: viewControllers,
                      }}
                      currentState={{
                        orderBy: orderByState ?? null,
                        filters: queryFilter.explicitFilterState ?? [],
                        columnOrder,
                        columnVisibility,
                        searchQuery: searchQuery ?? "",
                      }}
                    />
                  </div>
                )
              }
            />
          </div>
        )}

        {/* Content area with sidebar and table. The facet sidebar stays in
            search-bar mode and syncs bidirectionally with the bar. */}
        <ResizableFilterLayout>
          {/* On mobile the facet sidebar moves into the Filters sheet above,
              so it is not rendered inline here (leaving only the table content
              in the layout). */}
          {!hideControls && !isMobile && (
            <DataTableControls
              // Remount the sidebar when the saved view changes so the new view's filters replace any stale draft UI state.
              key={viewControllers.selectedViewId ?? "no-view"}
              queryFilter={queryFilter}
              // In bar mode AI filtering lives in the search bar; only offer the
              // sidebar wand on non-bar surfaces (embedded scoped tables).
              filterWithAI={!searchBarMode}
              // In chart mode, block filters the chart can't apply — active or
              // not — dimmed + hover reason. Stateless per-column resolver,
              // matching the search bar.
              blockedColumnReason={
                chartActive ? chartFilterExclusionReason : undefined
              }
            />
          )}

          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Pulse strip (LFE-14451): table-width, so the facet sidebar keeps
                its full height (design feedback); hidden in full chart mode. */}
            {outlierStripEnabled && chartViewMode !== "chart" && (
              <EventsOutlierStrip
                projectId={projectId}
                filterState={filterState}
                fromTimestamp={chartTimeWindow.from}
                toTimestamp={chartTimeWindow.to}
                searchIgnored={Boolean(searchQuery)}
                onSelectRange={setTimeRangeTransient}
              />
            )}
            {chartEnabled && chartViewMode === "chart" ? (
              <EventsChartView
                projectId={projectId}
                filterState={filterState}
                fromTimestamp={chartTimeWindow.from}
                toTimestamp={chartTimeWindow.to}
                config={chartConfig}
                onConfigChange={setChartConfig}
              />
            ) : (
              // No remount key: keying this on the fetch timestamp threw the
              // table (and its scroll position) away on every refresh. The body
              // re-renders on the new row array by itself.
              <DataTable
                tableName="observations"
                columns={columns}
                peekView={peekConfig}
                isFetching={isFetching}
                data={
                  observations.status === "loading" || isViewLoading
                    ? { isLoading: true, isError: false }
                    : observations.status === "error"
                      ? isSilencedError
                        ? {
                            isLoading: false,
                            isError: false,
                            data: [],
                          }
                        : {
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
                noResultsMessage={
                  isSilencedError ? (
                    <span className="text-muted-foreground">
                      {RESOURCE_LIMIT_ERROR_MESSAGE}
                    </span>
                  ) : undefined
                }
                pagination={
                  limitRows
                    ? undefined
                    : {
                        totalCount,
                        hasNextPage: hasMore,
                        hideTotalCount: true,
                        canJumpPages: false,
                        // Approx observation count ("Total ≈ X"), rides the filter-options scan (async).
                        approxTotalCount,
                        isApproxTotalCountLoading,
                        approxTotalCountIsPartialScope:
                          approxTotalCountIsPartial,
                        onChange: (updater) => {
                          const newState =
                            typeof updater === "function"
                              ? updater({
                                  pageIndex: paginationState.page - 1,
                                  pageSize: paginationState.limit,
                                })
                              : updater;
                          // Leaving page 1 freezes the paged set at the newest
                          // row still on screen, so page 2 continues where this
                          // page ends even if rows keep arriving.
                          pinOnLeavingFirstPage(
                            newState.pageIndex,
                            rows[0]?.startTime ?? undefined,
                          );
                          setPaginationState({
                            page: newState.pageIndex + 1,
                            limit: newState.pageSize,
                          });
                        },
                        state: {
                          pageIndex: paginationState.page - 1,
                          pageSize: paginationState.limit,
                        },
                      }
                }
                rowSelection={selectedRows}
                highlightAllRows={selectAll}
                setRowSelection={setSelectedRows}
                setOrderBy={setOrderByState}
                orderBy={orderByState}
                columnOrder={columnOrder}
                onColumnOrderChange={setColumnOrder}
                columnVisibility={columnVisibility}
                onColumnVisibilityChange={setColumnVisibilityState}
                rowHeight={rowHeight}
                onRowClick={(row, event) => {
                  // Handle Command/Ctrl+click to open observation in new tab
                  if (event && (event.metaKey || event.ctrlKey)) {
                    // Prevent the default peek behavior
                    event.preventDefault();

                    // Construct the observation URL directly to avoid race conditions
                    const observationId = row.id;
                    const traceId = row.traceId;
                    const timestamp = row.timestamp;

                    if (traceId) {
                      const observationUrl = buildTracePath({
                        projectId,
                        traceId,
                        observationId,
                        timestamp,
                      });

                      window.open(
                        getSafeRedirectPath(observationUrl),
                        "_blank",
                        "noopener,noreferrer",
                      );
                    }
                  }
                  // For normal clicks, let the data-table handle opening the peek view
                }}
              />
            )}
          </div>
        </ResizableFilterLayout>
        {peekConfig && (
          <TablePeekViewObservationDetail
            {...peekConfig}
            projectId={projectId}
          />
        )}
      </div>

      {showRunEvaluationDialog && (
        <RunEvaluationDialog
          projectId={projectId}
          selectedObservationIds={selectedObservationIds}
          query={{
            filter: filterState,
            orderBy: orderByState,
            searchQuery: searchQuery ?? undefined,
            searchType,
          }}
          selectAll={selectAll}
          totalCount={totalCount ?? 0}
          onClose={() => {
            setShowRunEvaluationDialog(false);
            setSelectedRows({});
            setSelectAll(false);
          }}
          exampleObservation={exampleObservation}
        />
      )}

      {showAddToDatasetDialog && (
        <AddObservationsToDatasetDialog
          projectId={projectId}
          selectedObservationIds={selectedObservationIds}
          query={{
            filter: filterState,
            orderBy: orderByState,
            searchQuery: searchQuery ?? undefined,
            searchType,
          }}
          selectAll={selectAll}
          totalCount={totalCount ?? 0}
          onClose={() => {
            setShowAddToDatasetDialog(false);
            setSelectedRows({});
            setSelectAll(false);
          }}
          exampleObservation={exampleObservation}
        />
      )}
    </DataTableControlsProvider>
  );
}
