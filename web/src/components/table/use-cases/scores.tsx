import { type ViewVersion } from "@langfuse/shared/query";
import { DataTable } from "@/src/components/table/data-table";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import {
  DataTableControlsProvider,
  DataTableControls,
} from "@/src/components/table/data-table-controls";
import { Skeleton } from "@/src/components/ui/skeleton";
import { createBadgeTableColumn } from "@/src/components/design-system/table/columns/createBadgeTableColumn";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createLinkTableColumn } from "@/src/components/design-system/table/columns/createLinkTableColumn";
import { createUserTableColumn } from "@/src/components/design-system/table/columns/createUserTableColumn";
import { createIOTableColumn } from "@/src/components/design-system/table/columns/createIOTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { ConnectedIOTableCell } from "@/src/components/table/ConnectedIOTableCell";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import {
  type UseSidebarFilterStateOptions,
  useSidebarFilterState,
} from "@/src/features/filters/hooks/useSidebarFilterState";
import { usePeekTableState } from "@/src/components/table/peek/contexts/PeekTableStateContext";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { TablePeekViewTraceDetail } from "@/src/components/table/peek/peek-trace-detail";
import {
  getScoreFilterConfig,
  observationScopeFilter,
  SCORE_COLUMN_TO_BACKEND_KEY,
  type ScoresTableHiddenColumn,
} from "@/src/features/filters/config/scores-config";
import {
  DEFAULT_SIDEBAR_IMPLICIT_ENVIRONMENT_CONFIG,
  isPresent,
  type FilterState,
  type ScoreDataTypeType,
  LISTABLE_SCORE_TYPES,
  BatchExportTableName,
  BatchActionType,
  TableViewPresetTableName,
  type TimeFilter,
} from "@langfuse/shared";
import { transformFiltersForBackend } from "@/src/features/filters/lib/filter-transform";
import { sortOptionValues } from "@/src/features/filters/lib/option-sort";
import { isNumericDataType } from "@/src/features/scores/lib/helpers";
import { getScoreChartTimeRange } from "@/src/features/scores-chart-view/fns/scoreChartConfig";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import { toAbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { api } from "@/src/utils/api";
import { TableHeaderControls } from "@/src/components/table/table-header-controls";

import type { RouterOutput } from "@/src/utils/types";
import TagList from "@/src/features/tag/components/TagList";
import { cn } from "@/src/utils/tailwind";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { BatchExportTableButton } from "@/src/components/BatchExportTableButton";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { TableActionMenu } from "@/src/features/table/components/TableActionMenu";
import React, { useState, useRef, useCallback, useMemo } from "react";
import type { TableAction } from "@/src/features/table/types";
import type { RowSelectionState } from "@tanstack/react-table";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useSelectAll } from "@/src/features/table/hooks/useSelectAll";
import { TableSelectionManager } from "@/src/features/table/components/TableSelectionManager";
import { useTableViewManager } from "@/src/components/table/table-view-presets/hooks/useTableViewManager";
import { createIdTableColumn } from "@/src/components/design-system/table/columns/createIdTableColumn";
import { usePaginationState } from "@/src/hooks/usePaginationState";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import {
  ScoreTag,
  scoreLevelFromScore,
  type ScoreLevel,
} from "@/src/components/score-tag";
import { ViewModeToggle } from "@/src/features/chart-view/components/ViewModeToggle";
import {
  ScoresChartView,
  ScoresOutlierStrip,
  useScoresChartViewState,
} from "@/src/features/scores-chart-view";

export type ScoresTableRow = {
  id: string;
  traceId?: string;
  sessionId?: string;
  datasetRunId?: string;
  timestamp: Date;
  source: string;
  name: string;
  /** Derived from the score's context ids (scoreLevelFromScore). */
  level: ScoreLevel;
  dataType: ScoreDataTypeType;
  value: string;
  author: {
    userId?: string;
    image?: string;
    name?: string;
  };
  comment?: string;
  metadata?: unknown;
  observationId?: string;
  traceName?: string;
  userId?: string;
  jobConfigurationId?: string;
  evaluatorId?: string;
  traceTags?: string[];
  environment?: string;
  executionTraceId?: string;
};

export type ScoresTableProps = {
  projectId: string;
  userId?: string;
  traceId?: string;
  observationId?: string;
  /**
   * Widen the `observationId` scope to also list the trace's trace-level scores
   * (no `observationId`). Set when the observation stands in for the trace — the
   * top-level span of a v4 trace, which carries them on its badge too.
   */
  includeTraceLevelScores?: boolean;
  hiddenColumns?: ScoresTableHiddenColumn[];
  localStorageSuffix?: string;
  disableUrlPersistence?: boolean;
  /**
   * When true, render the time-range picker and auto-refresh button in the
   * page header (next to the title) via the header controls slot, instead of
   * inside the table toolbar. Only used when the table is the primary content
   * of a `Page`.
   */
  showControlsInPageHeader?: boolean;
  /** Skip the default exclusion of internal environments. */
  showAllEnvironments?: boolean;
};

function createFilterState(
  userFilterState: FilterState,
  omittedFilters: Record<string, string>[],
): FilterState {
  return omittedFilters.reduce((filterState, { key, value }) => {
    return filterState.concat([
      {
        column: `${key}`,
        type: "string",
        operator: "=",
        value: value,
      },
    ]);
  }, userFilterState);
}

export default function ScoresTable({
  projectId,
  userId,
  traceId,
  observationId,
  includeTraceLevelScores = false,
  hiddenColumns = [],
  localStorageSuffix = "",
  disableUrlPersistence = false,
  showControlsInPageHeader = false,
  showAllEnvironments = false,
}: ScoresTableProps) {
  const peekContext = usePeekTableState();

  const scoresFilterConfig = useMemo(
    () => getScoreFilterConfig(hiddenColumns),
    [hiddenColumns],
  );
  const hiddenColumnSet = useMemo(
    () => new Set<string>(hiddenColumns),
    [hiddenColumns],
  );
  const { isV4 } = useReadPath();
  // In v4beta, scores must exclusively use events-backed endpoints (no traces-table route).
  const useEventsBackedScores = isV4;
  // Same derivation `WidgetForm.tsx`/`ChartScores` use (`activeVersion`/
  // `metricsVersion`) — the chart/outlier strip must read the same version
  // as the table's own data, or a non-beta project's trace/observation
  // breakdown would run against the events-backed view and come back empty.
  const chartViewVersion: ViewVersion = isV4 ? "v2" : "v1";
  const utils = api.useUtils();
  const [selectedRows, setSelectedRows] = useState<RowSelectionState>({});
  const [paginationState, setPaginationState] = usePaginationState(0, 50, {
    page: "pageIndex",
    limit: "pageSize",
  });
  const { selectAll, setSelectAll } = useSelectAll(projectId, "scores");

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage("scores", "s");
  const { timeRange, setTimeRange } = useTableDateRange(projectId);

  // Convert timeRange to absolute date range for compatibility
  const dateRange = React.useMemo(() => {
    return toAbsoluteTimeRange(timeRange) ?? undefined;
  }, [timeRange]);

  const dateRangeFilter: FilterState = dateRange
    ? [
        {
          column: "timestamp",
          type: "datetime",
          operator: ">=",
          value: dateRange.from,
        },
        ...(dateRange.to
          ? [
              {
                column: "timestamp",
                type: "datetime",
                operator: "<=",
                value: dateRange.to,
              } as const,
            ]
          : []),
      ]
    : [];

  // Scoped to a single trace (trace/observation detail): a time window can only
  // hide that trace's own scores — the trace id already bounds the query — so the
  // rows are unwindowed and the picker is not offered. The window still bounds the
  // filter-option queries, which are project-wide either way.
  const isTraceScoped = Boolean(traceId);
  const rowDateRangeFilter: FilterState = isTraceScoped ? [] : dateRangeFilter;

  // Open a score's trace/observation in the peek side panel instead of
  // navigating away, mirroring the traces/observations tables. Not offered
  // when this table is itself embedded in a trace/observation detail view
  // (peeking the very trace you're already looking at would be redundant,
  // and that embed already renders inside a peek panel of its own).
  const peekEnabled = !traceId && !observationId;
  const {
    openPeek: openScorePeek,
    closePeek: closeScorePeek,
    expandPeek: expandScorePeek,
  } = usePeekNavigation({
    // A stale `traceId` can already be in the URL (e.g. a v4-dialect shared
    // link); listing it clears it on open/navigate/close so it can't pin
    // the peek to that trace instead of the one just clicked — matches the
    // same guard `traces.tsx`/`EventsTable.tsx` already have.
    queryParams: ["observation", "display", "timestamp", "traceId"],
    tableName: scoresFilterConfig.tableName,
    isV4,
    extractParamsValuesFromRow: (
      row: ScoresTableRow,
    ): Record<string, string> =>
      row.observationId ? { observation: row.observationId } : {},
    expandConfig: {
      basePath: `/project/${projectId}/traces`,
      reader: "trace",
    },
  });

  // The chart toggle only makes sense on the project-wide table — a
  // trace/observation/user-scoped embed (trace detail, observation detail,
  // user page) has too few scores to chart meaningfully and its filters don't
  // fully map onto the scores-numeric view. Mirrors the same embed gate the
  // events table uses for its chart view.
  const chartEnabled = !traceId && !observationId && !userId;
  const {
    viewMode: chartViewMode,
    setViewMode: setChartViewMode,
    config: chartConfig,
    setConfig: setChartConfig,
  } = useScoresChartViewState();
  // Charts only render when the table has a time range. Inventing a default
  // range here would make the chart silently omit table rows.
  const chartTimeRange = useMemo(
    () => getScoreChartTimeRange(dateRange, new Date()),
    [dateRange],
  );
  const chartActive =
    chartEnabled && chartTimeRange !== undefined && chartViewMode === "chart";

  // Drill-in from the outlier strip writes the clicked bucket as an absolute
  // range. URL-only and deliberately NOT persisted as the project's default
  // range — a transient zoom must not become tomorrow's baseline. Mirrors the
  // events table's `setTimeRangeTransient`.
  const { setTimeRange: setScoresTimeRangeTransient } = useTableDateRange(
    projectId,
    { persistAsDefault: false },
  );

  const environmentFilterOptions =
    api.projects.environmentFilterOptions.useQuery(
      {
        projectId,
        fromTimestamp: dateRange?.from,
      },
      {
        trpc: { context: { skipBatch: true } },
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: Infinity,
      },
    );

  const environmentOptions = React.useMemo(
    () =>
      environmentFilterOptions.data?.map((value) => value.environment) ??
      undefined,
    [environmentFilterOptions.data],
  );

  const [orderByState, setOrderByState] = useOrderByState({
    column: "timestamp",
    order: "DESC",
  });

  const scoreDeleteMutation = api.scores.deleteMany.useMutation({
    onSuccess: () => {
      showSuccessToast({
        title: "Scores deleted",
        description:
          "Selected scores will be deleted. Scores are removed asynchronously and may continue to be visible for up to 15 minutes.",
      });
    },
    onSettled: () => {
      utils.scores.all.invalidate();
      utils.scores.allFromEvents.invalidate();
      utils.scores.countAllFromEvents.invalidate();

      if (traceId) {
        utils.traces.byIdWithObservationsAndScores.invalidate({
          projectId,
          traceId,
        });
        utils.events.scoresForTrace.invalidate({
          projectId,
          traceId,
        });
      }
    },
  });

  const hasTraceDeletionEntitlement = useHasEntitlement("trace-deletion");

  const handleDeleteScores = async ({ projectId }: { projectId: string }) => {
    const selectedScoreIds = Object.keys(selectedRows).filter((scoreId) =>
      scores.data?.scores.map((s) => s.id).includes(scoreId),
    );

    await scoreDeleteMutation.mutateAsync({
      projectId,
      scoreIds: selectedScoreIds,
      query: {
        filter: backendFilterState,
        orderBy: orderByState,
      },
      isBatchAction: selectAll,
    });
    setSelectedRows({});
  };

  // Filter options — v3 vs v4
  const filterOptionsTimestampInput = {
    projectId,
    timestampFilter:
      dateRangeFilter.length > 0
        ? (dateRangeFilter as TimeFilter[])
        : undefined,
  };

  const filterOptionsQueryConfig = {
    trpc: {
      context: {
        skipBatch: true,
      },
    },
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
  } as const;

  const filterOptionsV3 = api.scores.filterOptions.useQuery(
    filterOptionsTimestampInput,
    {
      ...filterOptionsQueryConfig,
      enabled: !useEventsBackedScores,
    },
  );

  const filterOptionsV4 = api.scores.filterOptionsFromEvents.useQuery(
    filterOptionsTimestampInput,
    {
      ...filterOptionsQueryConfig,
      enabled: useEventsBackedScores,
    },
  );

  const filterOptions = useEventsBackedScores
    ? filterOptionsV4
    : filterOptionsV3;

  const newFilterOptions = React.useMemo(
    () => ({
      name:
        filterOptions.data?.name?.map((n) => ({
          value: n.value,
          count: n.count !== undefined ? Number(n.count) : undefined,
        })) ?? undefined,
      source: ["ANNOTATION", "API", "EVAL"],
      dataType: [...LISTABLE_SCORE_TYPES],
      value: [],
      stringValue:
        filterOptions.data?.stringValue?.map((sv) => ({
          value: sv.value,
          count: sv.count !== undefined ? Number(sv.count) : undefined,
        })) ?? undefined,
      booleanValue: filterOptions.data?.booleanValue ?? undefined,
      traceName:
        filterOptions.data?.traceName?.map((tn) => ({
          value: tn.value,
          count: tn.count !== undefined ? Number(tn.count) : undefined,
        })) ?? undefined,
      userId:
        filterOptions.data?.userId?.map((u) => ({
          value: u.value,
          count: u.count !== undefined ? Number(u.count) : undefined,
        })) ?? undefined,
      // tags don't have counts; they read A→Z
      tags: sortOptionValues(filterOptions.data?.tags?.map((t) => t.value)),
      environment: environmentOptions,
    }),
    [filterOptions.data, environmentOptions],
  );

  const isSidebarFilterLoading =
    filterOptions.isPending || environmentFilterOptions.isPending;

  const queryFilterOptions: UseSidebarFilterStateOptions = useMemo(() => {
    const baseOptions = {
      loading: isSidebarFilterLoading,
      implicitDefaultConfig: showAllEnvironments
        ? undefined
        : DEFAULT_SIDEBAR_IMPLICIT_ENVIRONMENT_CONFIG,
    };

    if (peekContext) {
      return {
        ...baseOptions,
        stateLocation: "peekContext",
        context: peekContext,
      };
    }

    if (disableUrlPersistence) {
      return {
        ...baseOptions,
        stateLocation: "memory",
      };
    }

    return {
      ...baseOptions,
      stateLocation: "urlAndSessionStorage",
      sessionFilterContextId: projectId,
    };
  }, [
    disableUrlPersistence,
    isSidebarFilterLoading,
    peekContext,
    projectId,
    showAllEnvironments,
  ]);

  const queryFilter = useSidebarFilterState(
    scoresFilterConfig,
    newFilterOptions,
    queryFilterOptions,
  );

  // Create ref-based wrapper to avoid stale closure when queryFilter updates
  const queryFilterRef = useRef(queryFilter);
  queryFilterRef.current = queryFilter;

  const setFiltersWrapper = useCallback(
    (filters: FilterState) => queryFilterRef.current?.setFilterState(filters),
    [],
  );

  const filterState = createFilterState(
    queryFilter.effectiveFilterState.concat(
      rowDateRangeFilter,
      observationScopeFilter(observationId, includeTraceLevelScores),
    ),
    [
      ...(userId ? [{ key: "User ID", value: userId }] : []),
      ...(traceId ? [{ key: "Trace ID", value: traceId }] : []),
    ],
  );

  const backendFilterState = transformFiltersForBackend(
    filterState,
    SCORE_COLUMN_TO_BACKEND_KEY,
    scoresFilterConfig.columnDefinitions,
  );

  const getCountPayload = {
    projectId,
    filter: backendFilterState,
    orderBy: null,
  };

  const getAllPayload = {
    ...getCountPayload,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    orderBy: orderByState,
  };

  // In chart mode the table is hidden and the chart runs its own aggregate
  // query — don't also run the row/count/metrics fetches below, matching
  // `EventsTable.tsx`'s `rowsEnabled: !chartActive`.

  // Base data — v3 (existing, unchanged)
  const scoresV3 = api.scores.all.useQuery(getAllPayload, {
    enabled:
      !environmentFilterOptions.isLoading &&
      !useEventsBackedScores &&
      !chartActive,
  });

  // Base data — v4 (no traces JOIN)
  const scoresV4 = api.scores.allFromEvents.useQuery(getAllPayload, {
    enabled:
      !environmentFilterOptions.isLoading &&
      useEventsBackedScores &&
      !chartActive,
  });

  const scores = useEventsBackedScores ? scoresV4 : scoresV3;

  // Count — v3 vs v4
  const countV3 = api.scores.countAll.useQuery(getCountPayload, {
    enabled:
      !environmentFilterOptions.isLoading &&
      !useEventsBackedScores &&
      !chartActive,
  });
  const countV4 = api.scores.countAllFromEvents.useQuery(getCountPayload, {
    enabled:
      !environmentFilterOptions.isLoading &&
      useEventsBackedScores &&
      !chartActive,
  });
  const totalScoreCountQuery = useEventsBackedScores ? countV4 : countV3;

  const totalCount = totalScoreCountQuery.data?.totalCount ?? null;

  // Metrics — v4 only (loads trace metadata from events-backed aggregations)
  const scoreMetrics = api.scores.metricsFromEvents.useQuery(
    {
      projectId,
      traceIds: [
        ...new Set(
          scoresV4.data?.scores
            .map((s) => s.traceId)
            .filter((id): id is string => Boolean(id)) ?? [],
        ),
      ],
    },
    {
      enabled:
        scoresV4.data !== undefined && useEventsBackedScores && !chartActive,
    },
  );

  const { selectActionColumn } = TableSelectionManager<ScoresTableRow>({
    projectId,
    tableName: "scores",
    setSelectedRows,
    setSelectAll,
  });

  const rawColumns: LangfuseColumnDef<ScoresTableRow>[] = [
    selectActionColumn,
    createIdTableColumn<ScoresTableRow>({
      accessorKey: "id",
      enableColumnFilter: false,
      header: "Score ID",
      size: 100,
      enableSorting: false,
      defaultHidden: true,
      enableHiding: true,
    }),
    createDateTableColumn<ScoresTableRow>({
      accessorKey: "timestamp",
      header: "Timestamp",
      enableHiding: true,
      enableSorting: true,
      size: 150,
    }),
    createTextTableColumn<ScoresTableRow>({
      accessorKey: "name",
      header: "Name",
      enableHiding: true,
      enableSorting: true,
      size: 150,
    }),
    {
      accessorKey: "value",
      header: "Value",
      id: "value",
      enableHiding: true,
      enableSorting: true,
      size: 100,
    },
    createTextTableColumn<ScoresTableRow>({
      accessorKey: "dataType",
      header: "Data Type",
      enableHiding: true,
      enableSorting: true,
      defaultHidden: true,
      size: 100,
    }),
    {
      accessorKey: "source",
      header: "Source",
      id: "source",
      enableHiding: true,
      enableSorting: true,
      defaultHidden: true,
      size: 100,
    },
    {
      accessorKey: "level",
      header: "Level",
      id: "level",
      enableHiding: true,
      defaultHidden: true,
      // Derived client-side from the score's context ids — not a sortable
      // backend column.
      enableSorting: false,
      size: 110,
      cell: ({ row }) => {
        // Level tag (LFE-10596): trace- vs observation- (vs session-) level
        // scores look identical here otherwise.
        const level: ScoresTableRow["level"] = row.getValue("level");
        return <ScoreTag level={level} />;
      },
    },
    createIOTableColumn<ScoresTableRow>({
      accessorKey: "comment",
      header: "Comment",
      enableHiding: true,
      size: 400,
      getCell: (value) => value || undefined,
      singleLine: rowHeight === "s",
    }),
    createBadgeTableColumn<ScoresTableRow>({
      accessorKey: "environment",
      header: "Environment",
      size: 150,
      enableHiding: true,
      defaultHidden: true,
    }),
    {
      accessorKey: "traceTags",
      id: "traceTags",
      header: "Trace Tags",
      size: 250,
      enableHiding: true,
      defaultHidden: true,
      loadingCell: <Skeleton className="h-4 w-1/2" />,
      cell: ({ row }) => {
        if (isV4 && !scoreMetrics.data) {
          return <Skeleton className="h-4 w-1/2" />;
        }
        const traceTags: string[] | undefined = row.getValue("traceTags");
        return (
          traceTags &&
          traceTags.length > 0 && (
            <div
              className={cn(
                "flex gap-x-2 gap-y-1",
                rowHeight !== "s" && "flex-wrap",
              )}
            >
              <TagList selectedTags={traceTags} isLoading={false} viewOnly />
            </div>
          )
        );
      },
    },
    {
      accessorKey: "metadata",
      header: "Metadata",
      id: "metadata",
      size: 400,
      loadingCell: () => (
        <ConnectedIOTableCell isLoading singleLine={rowHeight === "s"} />
      ),
      headerTooltip: {
        description: "Add metadata to scores to track additional information.",
        // TODO: docs for metadata on scores
        href: "https://langfuse.com/docs/observability/features/metadata",
      },
      cell: ({ row }) => {
        const scoreId: ScoresTableRow["id"] = row.getValue("id");
        return (
          <ScoresMetadataCell
            scoreId={scoreId}
            projectId={projectId}
            singleLine={rowHeight === "s"}
          />
        );
      },
      enableHiding: true,
      defaultHidden: true,
    },
    createLinkTableColumn<ScoresTableRow>({
      accessorKey: "traceName",
      header: "Trace Name",
      enableHiding: true,
      enableSorting: true,
      defaultHidden: true,
      size: 150,
      getCell: (value) => {
        if (isV4 && !scoreMetrics.data) return { type: "loading" };
        if (!value) return undefined;

        const filter = encodeURIComponent(
          `name;stringOptions;;any of;${value}`,
        );
        return {
          type: "link",
          props: {
            path: `/project/${projectId}/traces?filter=${filter}`,
            value,
          },
        };
      },
    }),
    createLinkTableColumn<ScoresTableRow>({
      accessorKey: "traceId",
      enableColumnFilter: true,
      header: "Trace",
      enableSorting: true,
      size: 100,
      getCell: (value) => {
        if (typeof value !== "string") return undefined;

        if (peekEnabled) {
          return {
            type: "link",
            props: {
              path: `/project/${projectId}/traces/${encodeURIComponent(value)}`,
              value,
              // Opens the trace in the peek side panel instead of navigating
              // away; a modifier-click still opens the href in a new tab.
              onClick: () => openScorePeek(value),
            },
          };
        }

        return {
          type: "link",
          props: {
            path: `/project/${projectId}/traces/${encodeURIComponent(value)}`,
            value,
            onClick: undefined,
          },
        };
      },
    }),
    createLinkTableColumn<ScoresTableRow>({
      accessorKey: "observationId",
      header: "Observation",
      enableSorting: true,
      size: 100,
      getCell: (observationId, { row }) => {
        const traceId = row.getValue("traceId") as ScoresTableRow["traceId"];
        if (!traceId || !observationId) return undefined;

        if (peekEnabled) {
          return {
            type: "link",
            props: {
              path: `/project/${projectId}/traces/${encodeURIComponent(traceId)}?observation=${encodeURIComponent(observationId)}`,
              value: observationId,
              // extractParamsValuesFromRow reads the original row to focus
              // this observation within the trace in the peek URL.
              onClick: () => openScorePeek(traceId, row.original),
            },
          };
        }

        return {
          type: "link",
          props: {
            path: `/project/${projectId}/traces/${encodeURIComponent(traceId)}?observation=${encodeURIComponent(observationId)}`,
            value: observationId,
            onClick: undefined,
          },
        };
      },
    }),
    createLinkTableColumn<ScoresTableRow>({
      accessorKey: "executionTraceId",
      header: "Execution Trace",
      enableSorting: false,
      enableHiding: true,
      defaultHidden: true,
      size: 100,
      getCell: (value) => {
        if (typeof value !== "string") return undefined;

        return {
          type: "link",
          props: {
            path: `/project/${projectId}/traces/${encodeURIComponent(value)}`,
            value,
          },
        };
      },
    }),
    createLinkTableColumn<ScoresTableRow>({
      accessorKey: "sessionId",
      header: "Session",
      enableHiding: true,
      enableSorting: true,
      size: 100,
      getCell: (value) => {
        if (typeof value !== "string") return undefined;

        return {
          type: "link",
          props: {
            path: `/project/${projectId}/sessions/${encodeURIComponent(value)}`,
            value,
          },
        };
      },
    }),
    createLinkTableColumn<ScoresTableRow>({
      accessorKey: "userId",
      header: "User",
      headerTooltip: {
        description: "The user ID associated with the trace.",
        href: "https://langfuse.com/docs/observability/features/users",
      },
      enableHiding: true,
      enableSorting: true,
      defaultHidden: true,
      size: 100,
      getCell: (value) => {
        if (isV4 && !scoreMetrics.data) return { type: "loading" };
        if (typeof value !== "string") return undefined;

        return {
          type: "link",
          props: {
            path: `/project/${projectId}/users/${encodeURIComponent(value)}`,
            value,
          },
        };
      },
    }),
    createUserTableColumn<ScoresTableRow, ScoresTableRow["author"]>({
      accessorKey: "author",
      header: "Author",
      enableHiding: true,
      defaultHidden: true,
      size: 150,
      variant: "avatar",
      emptyValue: "",
      getUser: (author) => {
        if (!author) return undefined;

        const { userId, name, image } = author;
        return {
          type: "user",
          user: { id: userId, name, image },
        };
      },
    }),
    createLinkTableColumn<ScoresTableRow>({
      accessorKey: "jobConfigurationId",
      header: isV4 ? "Evaluator" : "Eval Configuration ID",
      headerTooltip: {
        description: isV4
          ? "The evaluator associated with the score."
          : "The Job Configuration ID associated with the score.",
        href: "https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge",
      },
      enableHiding: true,
      enableSorting: false,
      defaultHidden: true,
      size: 150,
      getCell: (_, { row }) => {
        if (isV4) {
          const value = row.original.evaluatorId;
          if (typeof value !== "string") return undefined;

          return {
            type: "link",
            props: {
              path: `/project/${projectId}/evals/${value}`,
              value,
            },
          };
        }

        const value = row.getValue("jobConfigurationId");
        if (typeof value !== "string") return undefined;

        return {
          type: "link",
          props: {
            path: `/project/${projectId}/evals/legacy/${value}`,
            value,
          },
        };
      },
    }),
  ];

  const tableActions: TableAction[] = [
    ...(hasTraceDeletionEntitlement
      ? [
          {
            id: "score-delete",
            type: BatchActionType.Delete,
            label: "Delete Scores",
            description:
              "This action permanently deletes scores and cannot be undone. Score deletion happens asynchronously and may take up to 15 minutes.",
            accessCheck: {
              scope: "traces:delete",
              entitlement: "trace-deletion",
            },
            execute: handleDeleteScores,
          } as TableAction,
        ]
      : []),
  ];

  const columns = rawColumns.filter(
    (c) => !!c.id && !hiddenColumnSet.has(c.id),
  );

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<ScoresTableRow>(
      "scoresColumnVisibility" + localStorageSuffix,
      columns,
    );

  const [columnOrder, setColumnOrder] = useColumnOrder<ScoresTableRow>(
    `scoresColumnOrder${localStorageSuffix}`,
    columns,
  );

  const convertToTableRow = (
    score: RouterOutput["scores"]["all"]["scores"][0],
  ): ScoresTableRow => {
    return {
      id: score.id,
      timestamp: score.timestamp,
      source: score.source,
      name: score.name,
      level: scoreLevelFromScore(score),
      dataType: score.dataType,
      value:
        isNumericDataType(score.dataType) && isPresent(score.value)
          ? score.value % 1 === 0
            ? String(score.value)
            : score.value.toFixed(4)
          : (score.stringValue ?? ""),
      author: {
        userId: score.authorUserId ?? undefined,
        image: score.authorUserImage ?? undefined,
        name: score.authorUserName ?? undefined,
      },
      comment: score.comment ?? undefined,
      observationId: score.observationId ?? undefined,
      sessionId: score.sessionId ?? undefined,
      datasetRunId: score.datasetRunId ?? undefined,
      traceId: score.traceId ?? undefined,
      traceName: score.traceName ?? undefined,
      userId: score.traceUserId ?? undefined,
      jobConfigurationId: score.jobConfigurationId ?? undefined,
      evaluatorId: undefined,
      traceTags: score.traceTags ?? undefined,
      environment: score.environment ?? undefined,
      executionTraceId: score.executionTraceId ?? undefined,
    };
  };

  // Merge v4 metrics into table rows
  const enrichedScores = useMemo(() => {
    if (!isV4) {
      return scoresV3.data?.scores.map(convertToTableRow);
    }

    const v4Data = scoresV4.data?.scores;
    if (!v4Data) return undefined;

    const metaByTraceId = new Map(
      scoreMetrics.data?.map((m) => [m.traceId, m]) ?? [],
    );

    return v4Data.map((score) => {
      const meta = metaByTraceId.get(score.traceId ?? "");
      return {
        id: score.id,
        timestamp: score.timestamp,
        source: score.source,
        name: score.name,
        level: scoreLevelFromScore(score),
        dataType: score.dataType,
        value:
          isNumericDataType(score.dataType) && isPresent(score.value)
            ? score.value % 1 === 0
              ? String(score.value)
              : score.value.toFixed(4)
            : (score.stringValue ?? ""),
        author: {
          userId: score.authorUserId ?? undefined,
          image: score.authorUserImage ?? undefined,
          name: score.authorUserName ?? undefined,
        },
        comment: score.comment ?? undefined,
        observationId: score.observationId ?? undefined,
        sessionId: score.sessionId ?? undefined,
        datasetRunId: score.datasetRunId ?? undefined,
        traceId: score.traceId ?? undefined,
        traceName: meta?.traceName ?? undefined,
        userId: meta?.userId ?? undefined,
        jobConfigurationId: score.jobConfigurationId ?? undefined,
        evaluatorId: score.evaluatorId ?? undefined,
        traceTags: meta?.tags ?? undefined,
        environment: score.environment ?? undefined,
        executionTraceId: score.executionTraceId ?? undefined,
      } satisfies ScoresTableRow;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scores.data, scoreMetrics.data, isV4]);

  const { isLoading: isViewLoading, ...viewControllers } = useTableViewManager({
    tableName: TableViewPresetTableName.Scores,
    projectId,
    stateUpdaters: {
      setOrderBy: setOrderByState,
      setFilters: setFiltersWrapper,
      setExpandedFilters: queryFilter.onExpandedChange,
      setColumnOrder: setColumnOrder,
      setColumnVisibility: setColumnVisibility,
    },
    validationContext: {
      columns,
      filterColumnDefinition: scoresFilterConfig.columnDefinitions,
      expandableFilterColumns: scoresFilterConfig.facets.map(
        (facet) => facet.column,
      ),
    },
    currentFilterState: queryFilter.explicitFilterState,
    currentExpandedFilters: queryFilter.expanded,
  });

  const visibleSelectedScoreIds = useMemo(
    () =>
      Object.keys(selectedRows).filter((scoreId) =>
        scores.data?.scores.map((s) => s.id).includes(scoreId),
      ),
    [selectedRows, scores.data?.scores],
  );

  const selectedScoreCount = selectAll
    ? totalCount
    : visibleSelectedScoreIds.length;

  return (
    <DataTableControlsProvider
      tableName={scoresFilterConfig.tableName}
      defaultSidebarCollapsed={scoresFilterConfig.defaultSidebarCollapsed}
    >
      <div className="flex h-full w-full flex-col">
        {showControlsInPageHeader && (
          <TableHeaderControls
            timeRange={timeRange}
            setTimeRange={setTimeRange}
          />
        )}
        {/* Toolbar spanning full width */}
        <DataTableToolbar
          columns={columns}
          filterState={queryFilter.explicitFilterState}
          columnVisibility={columnVisibility}
          setColumnVisibility={setColumnVisibility}
          columnOrder={columnOrder}
          setColumnOrder={setColumnOrder}
          viewConfig={{
            tableName: TableViewPresetTableName.Scores,
            projectId,
            controllers: viewControllers,
          }}
          actionButtons={[
            visibleSelectedScoreIds.length > 0 || selectAll ? (
              <TableActionMenu
                key="scores-multi-select-actions"
                projectId={projectId}
                actions={tableActions}
                tableName={BatchExportTableName.Scores}
                selectedCount={selectedScoreCount}
                onClearSelection={() => {
                  setSelectedRows({});
                  setSelectAll(false);
                }}
              />
            ) : null,
            <BatchExportTableButton
              {...{ projectId, filterState: backendFilterState, orderByState }}
              tableName={BatchExportTableName.Scores}
              key="batchExport"
            />,
          ]}
          rowHeight={rowHeight}
          setRowHeight={setRowHeight}
          timeRange={
            showControlsInPageHeader || isTraceScoped ? undefined : timeRange
          }
          setTimeRange={
            showControlsInPageHeader || isTraceScoped ? undefined : setTimeRange
          }
          viewModeToggle={
            chartEnabled && chartTimeRange ? (
              <ViewModeToggle
                mode={chartViewMode}
                onModeChange={setChartViewMode}
              />
            ) : undefined
          }
          multiSelect={{
            selectAll,
            setSelectAll,
            selectedRowIds: visibleSelectedScoreIds,
            setRowSelection: setSelectedRows,
            totalCount,
            ...paginationState,
          }}
        />

        {/* Content area with sidebar and table */}
        <ResizableFilterLayout>
          <DataTableControls
            // Remount the sidebar when the saved view changes so the new view's filters replace any stale draft UI state.
            key={viewControllers.selectedViewId ?? "no-view"}
            queryFilter={queryFilter}
          />

          <div className="flex flex-1 flex-col overflow-hidden">
            {/* `effectiveFilterState`, not `explicitFilterState`: the table's
                own data query (`getAllPayload` above) reads `effectiveFilterState`,
                which folds in the implicit environment filter (hides internal
                eval/experiment environments by default). Using the explicit
                state here would let the chart/strip aggregate scores the table
                itself doesn't show. */}
            {chartEnabled && chartTimeRange && !chartActive && (
              <ScoresOutlierStrip
                projectId={projectId}
                filterState={queryFilter.effectiveFilterState}
                fromTimestamp={chartTimeRange.from}
                toTimestamp={chartTimeRange.to}
                onSelectRange={setScoresTimeRangeTransient}
                viewVersion={chartViewVersion}
              />
            )}
            {chartActive && chartTimeRange ? (
              <ScoresChartView
                projectId={projectId}
                filterState={queryFilter.effectiveFilterState}
                fromTimestamp={chartTimeRange.from}
                toTimestamp={chartTimeRange.to}
                config={chartConfig}
                viewVersion={chartViewVersion}
                onConfigChange={setChartConfig}
              />
            ) : (
              <DataTable
                tableName="scores"
                columns={columns}
                noResultsMessage={
                  <div className="flex flex-col items-center">
                    <span>No scores found.</span>
                    <a
                      href="https://langfuse.com/faq/all/what-are-scores"
                      className="text-primary pointer-events-auto italic underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      What are scores?
                    </a>
                  </div>
                }
                data={
                  scores.isPending || isViewLoading
                    ? { isLoading: true, isError: false }
                    : scores.isError
                      ? {
                          isLoading: false,
                          isError: true,
                          error: scores.error.message,
                        }
                      : {
                          isLoading: false,
                          isError: false,
                          data: enrichedScores ?? [],
                        }
                }
                pagination={{
                  totalCount,
                  onChange: setPaginationState,
                  state: paginationState,
                }}
                setOrderBy={setOrderByState}
                orderBy={orderByState}
                rowSelection={selectedRows}
                highlightAllRows={selectAll}
                setRowSelection={setSelectedRows}
                columnVisibility={columnVisibility}
                onColumnVisibilityChange={setColumnVisibility}
                columnOrder={columnOrder}
                onColumnOrderChange={setColumnOrder}
                rowHeight={rowHeight}
              />
            )}
          </div>
        </ResizableFilterLayout>
        {peekEnabled && (
          <TablePeekViewTraceDetail
            closePeek={closeScorePeek}
            expandPeek={expandScorePeek}
            itemType="TRACE"
            tableName={scoresFilterConfig.tableName}
            isV4={isV4}
            projectId={projectId}
          />
        )}
      </div>
    </DataTableControlsProvider>
  );
}

const ScoresMetadataCell = ({
  scoreId,
  projectId,
  singleLine = false,
}: {
  scoreId: string;
  projectId: string;
  singleLine?: boolean;
}) => {
  const score = api.scores.byId.useQuery(
    { scoreId, projectId },
    {
      enabled: typeof scoreId === "string",
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false, // prevents refetching loops
    },
  );
  if (score.isPending) {
    return <ConnectedIOTableCell isLoading singleLine={singleLine} />;
  }

  return (
    <ConnectedIOTableCell data={score.data?.metadata} singleLine={singleLine} />
  );
};
