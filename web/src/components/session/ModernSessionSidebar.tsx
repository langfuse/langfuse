import React, { useCallback, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronDown,
  ListFilter,
  MoreHorizontal,
  Pencil,
  Save,
  Search,
  X,
} from "lucide-react";
import { type FilterState } from "@langfuse/shared";

import { renderFilterIcon } from "@/src/components/ItemBadge";
import { SessionVirtualizedRow } from "@/src/components/session/SessionVirtualizedRow";
import { type EventSessionTrace } from "@/src/components/session/sessionDetailPageTypes";
import {
  ModernSessionViewDropdownMenu,
  type ModernSessionViewDropdownMenuControls,
} from "@/src/components/session/ModernSessionViewDropdownMenu";
import { SESSION_DETAIL_VIEW_TRIGGER_ID } from "@/src/components/session/session-detail-presets";
import {
  computeIdleGapSeconds,
  formatIdleGap,
  IDLE_GAP_THRESHOLD_SECONDS,
} from "@/src/components/session/sessionIdleGap";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { InlineFilterState } from "@/src/features/filters/components/filter-builder";
import { ComposerTokens } from "@/src/features/search-bar/components/ComposerTokens";
import { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { cn } from "@/src/utils/tailwind";

const OBSERVATION_LIST_OVERSCAN = 5;
const SIDEBAR_AUTO_FOLLOW_IDLE_MS = 750;

type ObservationListRow = {
  id: string;
  name: string | null;
  type: string;
  latency: number | null;
};

type ObservationListRowsState =
  | { type: "loading" }
  | { type: "error" }
  | { type: "trace-io-only" }
  | { type: "empty"; hasFilters: boolean }
  | { type: "loaded"; rows: ObservationListRow[] };

export type ModernSessionSidebarTrace = {
  trace: EventSessionTrace;
  turnNumber: number;
  observations: ObservationListRow[] | null | undefined;
  hasMatchingTraceLevelIO: boolean;
};

const EMPTY_TRACES: ModernSessionSidebarTrace[] = [];

export type ModernSessionSidebarFilterControls =
  ModernSessionViewDropdownMenuControls & {
    activeFilterCount: number;
    activeFilters: FilterState;
    activeViewName: string | undefined;
    selectedViewId: string | null;
    onClearFilters: () => void;
  };

function ObservationListRows({
  state,
  onSelectObservation,
  onExcludeObservation,
}:
  | {
      state: Extract<
        ObservationListRowsState,
        { type: "loading" | "error" | "trace-io-only" | "empty" }
      >;
      onSelectObservation?: never;
      onExcludeObservation?: never;
    }
  | {
      state: Extract<ObservationListRowsState, { type: "loaded" }>;
      onSelectObservation: (observationId: string) => void;
      onExcludeObservation?: (name: string) => void;
    }) {
  if (state.type === "loading") {
    return (
      <div className="-mx-1 flex flex-col gap-1 px-1 py-2">
        <div className="bg-muted h-3 w-3/4 animate-pulse rounded-sm" />
        <div className="bg-muted h-3 w-1/2 animate-pulse rounded-sm" />
      </div>
    );
  }

  if (state.type === "empty") {
    return (
      <p className="text-muted-foreground -mx-1 px-1 py-2 text-xs">
        {state.hasFilters
          ? "No matching child observations"
          : "No child observations"}
      </p>
    );
  }

  if (state.type === "trace-io-only") {
    return (
      <div className="border-border bg-border/40 text-foreground -mx-1 mt-2 rounded-sm border px-2 py-1.5 text-xs">
        Trace-level I/O only
      </div>
    );
  }

  if (state.type === "error") {
    return (
      <p className="text-muted-foreground -mx-1 px-1 py-2 text-xs">
        Failed to load observations
      </p>
    );
  }

  return (
    <div className="mt-2 flex flex-col">
      {state.rows.map((observation) => (
        <div
          key={observation.id}
          className="hover:bg-foreground/10 -mr-2 -ml-1 flex items-center rounded-sm transition-colors duration-150"
        >
          <button
            type="button"
            onClick={() => onSelectObservation(observation.id)}
            className="flex min-w-0 flex-1 items-center gap-2 px-1 py-1 text-left"
          >
            {renderFilterIcon(observation.type)}
            <span
              className="text-muted-foreground min-w-0 flex-1 truncate text-[13px]"
              title={observation.name ?? observation.id}
            >
              {observation.name ?? observation.id}
            </span>
            {observation.latency !== null && observation.type !== "EVENT" ? (
              <span className="text-muted-foreground shrink-0 font-mono text-[11px]">
                {formatIntervalSeconds(observation.latency)}
              </span>
            ) : null}
          </button>
          {observation.name && onExcludeObservation ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-muted-foreground -my-1 -mr-0.5 h-8 w-8 shrink-0 hover:bg-transparent"
                  aria-label={`Actions for ${observation.name}`}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={0}>
                <DropdownMenuItem
                  onSelect={() =>
                    onExcludeObservation(observation.name as string)
                  }
                >
                  Exclude similar observations
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ))}
    </div>
  );
}

const TurnCard = React.memo(
  ({
    sidebarTrace,
    selectIndex,
    isActive,
    isCollapsed,
    onToggleCollapse,
    onSelect,
    hasFilters,
    onExcludeObservation,
  }: {
    sidebarTrace: ModernSessionSidebarTrace;
    selectIndex: number;
    isActive: boolean;
    isCollapsed: boolean;
    onToggleCollapse: (traceId: string) => void;
    onSelect: (index: number, observationId?: string) => void;
    hasFilters: boolean;
    onExcludeObservation: (name: string) => void;
  }) => {
    const { trace, turnNumber, observations, hasMatchingTraceLevelIO } =
      sidebarTrace;
    const isTraceLevelIOOnly =
      hasMatchingTraceLevelIO && observations?.length === 0;

    return (
      <div
        onClick={(event) => {
          if (!isTraceLevelIOOnly) return;
          if ((event.target as Element).closest("button, [role='button']")) {
            return;
          }
          onSelect(selectIndex);
        }}
        className={cn(
          "group hover:bg-foreground/[0.03] rounded-sm border border-transparent p-2 transition-colors duration-150",
          isActive && "bg-foreground/5",
          isTraceLevelIOOnly && "cursor-pointer",
        )}
        data-observation-list-active={isActive}
      >
        <button
          type="button"
          onClick={() => onSelect(selectIndex)}
          className="flex w-full items-center gap-2 text-left"
          aria-current={isActive ? "true" : undefined}
        >
          <span className="border-border bg-tertiary text-foreground flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border font-mono text-[10px]">
            {turnNumber}
          </span>
          <span
            className="min-w-0 flex-1 truncate text-[13px] font-bold"
            title={trace.name ?? "Trace"}
          >
            {trace.name ?? "Trace"}
          </span>
          <span
            role="button"
            tabIndex={0}
            aria-label={isCollapsed ? "Expand turn" : "Collapse turn"}
            onClick={(event) => {
              event.stopPropagation();
              onToggleCollapse(trace.id);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onToggleCollapse(trace.id);
              }
            }}
            className="text-muted-foreground -my-2 -mr-2.5 -ml-2 flex h-8 w-8 shrink-0 items-center justify-center"
          >
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform duration-150",
                isCollapsed ? "-rotate-90" : "rotate-0",
              )}
              strokeWidth={1.6}
            />
          </span>
        </button>
        {!isCollapsed ? (
          observations === undefined ? (
            <ObservationListRows state={{ type: "loading" }} />
          ) : observations === null ? (
            <ObservationListRows state={{ type: "error" }} />
          ) : observations.length === 0 ? (
            <ObservationListRows
              state={
                isTraceLevelIOOnly
                  ? { type: "trace-io-only" }
                  : { type: "empty", hasFilters }
              }
            />
          ) : (
            <ObservationListRows
              state={{ type: "loaded", rows: observations }}
              onSelectObservation={(observationId) =>
                onSelect(selectIndex, observationId)
              }
              onExcludeObservation={onExcludeObservation}
            />
          )
        ) : null}
      </div>
    );
  },
);
TurnCard.displayName = "TurnCard";

export function ModernSessionSidebar(
  props:
    | { state: "loading" }
    | {
        state: "loaded";
        traces: ModernSessionSidebarTrace[];
        activeTraceId: string | undefined;
        filterControls: ModernSessionSidebarFilterControls;
        search: string;
        onSearchChange: (search: string) => void;
        expandedTraceIds: ReadonlySet<string>;
        onToggleTraceExpanded: (traceId: string) => void;
        onExcludeObservation: (name: string) => void;
        onSelect: (index: number, observationId?: string) => void;
        onVisibleTraceIdsChange: (traceIds: string[]) => void;
        hasMoreObservations: boolean;
        isLoadingMoreObservations: boolean;
        observationLoadError: boolean;
        onLoadMoreObservations: () => void;
        onViewportUnderfilled?: () => void;
      },
) {
  const traces = props.state === "loaded" ? props.traces : EMPTY_TRACES;
  const activeTraceId =
    props.state === "loaded" ? props.activeTraceId : undefined;
  const listRef = useRef<HTMLDivElement>(null);
  const isSidebarPointerDownRef = useRef(false);
  const autoFollowPausedUntilRef = useRef(0);

  const idleGapSeconds = useMemo(
    () =>
      traces.map(({ trace }, index) =>
        index === 0
          ? null
          : computeIdleGapSeconds(traces[index - 1]!.trace, trace),
      ),
    [traces],
  );

  const virtualizer = useVirtualizer({
    count: traces.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 160,
    overscan: OBSERVATION_LIST_OVERSCAN,
    getItemKey: (index) => traces[index]?.trace.id ?? index,
    onChange: (instance) => {
      if (props.state !== "loaded") return;

      props.onVisibleTraceIdsChange(
        instance.getVirtualItems().flatMap((virtualItem) => {
          const traceId = traces[virtualItem.index]?.trace.id;
          return traceId ? [traceId] : [];
        }),
      );

      const scrollElement = instance.scrollElement;
      if (
        props.onViewportUnderfilled &&
        props.hasMoreObservations &&
        !props.isLoadingMoreObservations &&
        scrollElement &&
        instance.getTotalSize() <= scrollElement.clientHeight
      ) {
        props.onViewportUnderfilled();
      }
    },
  });
  const activeTraceIndex = activeTraceId
    ? traces.findIndex(({ trace }) => trace.id === activeTraceId)
    : -1;
  const virtualItems = virtualizer.getVirtualItems();
  const setListElement = useCallback(
    (element: HTMLDivElement | null) => {
      listRef.current = element;
      if (
        !element ||
        activeTraceIndex === -1 ||
        isSidebarPointerDownRef.current ||
        Date.now() < autoFollowPausedUntilRef.current
      ) {
        return;
      }

      // `auto` moves the minimum distance and does nothing while the row is visible.
      virtualizer.scrollToIndex(activeTraceIndex, { align: "auto" });
    },
    [activeTraceIndex, virtualizer],
  );

  const handleTransientSidebarScroll = () => {
    autoFollowPausedUntilRef.current = Date.now() + SIDEBAR_AUTO_FOLLOW_IDLE_MS;
  };

  const handleSidebarScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const { clientHeight, scrollTop } = event.currentTarget;
    const viewportBottom = scrollTop + clientHeight;
    const visibleTurn = virtualItems.findLast(
      (virtualItem) => virtualItem.start < viewportBottom,
    );
    const loadMoreThreshold = visibleTurn
      ? Math.min(240, visibleTurn.size / 4)
      : 0;
    if (
      props.state === "loaded" &&
      props.hasMoreObservations &&
      !props.isLoadingMoreObservations &&
      visibleTurn &&
      viewportBottom >= visibleTurn.end - loadMoreThreshold
    ) {
      props.onLoadMoreObservations();
    }
  };

  const handleSidebarPointerDown = () => {
    isSidebarPointerDownRef.current = true;
  };

  const handleSidebarPointerEnd = () => {
    isSidebarPointerDownRef.current = false;
    handleTransientSidebarScroll();
  };

  if (props.state === "loading") {
    return (
      <div
        role="complementary"
        aria-label="Session observations"
        aria-busy="true"
        className="bg-background dark:bg-header relative flex h-full min-h-0 flex-col border-r"
      >
        <div className="flex shrink-0 items-center border-b px-2 py-2.5">
          <div className="bg-muted h-7 flex-1 animate-pulse rounded-sm" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2 px-1 pt-0.5 pb-4">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="flex flex-col gap-2 rounded-sm border border-transparent p-2"
            >
              <div className="flex items-center gap-2">
                <div className="bg-muted h-4 w-4 animate-pulse rounded-sm" />
                <div className="bg-muted h-3 flex-1 animate-pulse rounded-sm" />
                <div className="bg-muted h-4 w-4 animate-pulse rounded-sm" />
              </div>
              <div className="bg-muted h-2.5 w-3/4 animate-pulse rounded-sm" />
              <div className="bg-muted h-2.5 w-1/2 animate-pulse rounded-sm" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const {
    filterControls,
    search,
    onSearchChange,
    expandedTraceIds,
    onToggleTraceExpanded,
    onExcludeObservation,
    onSelect,
  } = props;
  const handleSearchChange = (nextSearch: string) => {
    virtualizer.scrollToOffset(0);
    onSearchChange(nextSearch);
  };
  const showFilterSummary = Boolean(
    filterControls.activeFilterCount > 0 ||
    filterControls.activeViewName ||
    filterControls.selectedViewId,
  );
  const filterSummaryLabel = filterControls.activeViewName
    ? `View: ${filterControls.activeViewName}`
    : `${filterControls.activeFilterCount} active filters`;
  const activeFilterQuery = filterStateToQueryText(
    filterControls.activeFilters,
  );
  const hasFilterRepresentation = Boolean(
    activeFilterQuery.text || activeFilterQuery.skippedFilters.length > 0,
  );

  return (
    <div
      role="complementary"
      aria-label="Session observations"
      className="bg-background dark:bg-header relative flex h-full min-h-0 flex-col border-r"
    >
      <div className="shrink-0 border-b">
        <div className="flex items-center gap-1 px-2 py-2.5">
          <div className="relative min-w-0 flex-1">
            <Search
              className="text-foreground-tertiary absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2"
              strokeWidth={1.6}
            />
            <Input
              value={search}
              onChange={(event) => handleSearchChange(event.target.value)}
              aria-label="Search turns and observations"
              placeholder="Search turns and observations"
              className="h-7 rounded-sm bg-transparent pl-7 font-mono text-xs"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                id={SESSION_DETAIL_VIEW_TRIGGER_ID}
                type="button"
                variant="outline"
                size="icon"
                className="relative h-7 w-7 shrink-0 rounded-sm"
                aria-label="Filter observations"
              >
                <ListFilter className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <ModernSessionViewDropdownMenu controls={filterControls} />
          </DropdownMenu>
        </div>
        {showFilterSummary ? (
          <div className="border-t px-2 py-2.5">
            <div className="border-border/80 bg-muted/30 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1.5 rounded-md border py-2 pr-1 pl-2.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="text-muted-foreground min-w-0 overflow-hidden font-mono text-[10px] text-ellipsis whitespace-nowrap"
                    tabIndex={0}
                  >
                    {filterSummaryLabel}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-80 p-2">
                  {hasFilterRepresentation ? (
                    <div className="flex flex-wrap gap-1">
                      {activeFilterQuery.text ? (
                        <span className="min-w-0 font-mono text-xs leading-6">
                          <ComposerTokens
                            draft={activeFilterQuery.text}
                            showDiagnostics={false}
                          />
                        </span>
                      ) : null}
                      <InlineFilterState
                        filterState={activeFilterQuery.skippedFilters}
                        className="m-0"
                      />
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      No filters
                    </span>
                  )}
                </TooltipContent>
              </Tooltip>
              <div className="flex shrink-0 items-center">
                {!filterControls.activeViewName ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground hover:text-foreground h-5 w-5"
                        aria-label="Save filters as view"
                        onClick={filterControls.onOpenFilterDialog}
                      >
                        <Save className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Save as view</TooltipContent>
                  </Tooltip>
                ) : null}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground hover:text-foreground h-5 w-5"
                      aria-label="Edit filters"
                      onClick={filterControls.onOpenFilterDialog}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit filters</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground hover:text-foreground h-5 w-5"
                      aria-label="Clear filters"
                      onClick={filterControls.onClearFilters}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Clear filters</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <div
        ref={setListElement}
        role="region"
        aria-label="Session turns"
        className="min-h-0 flex-1 overflow-y-auto pt-0.5 pb-4"
        onWheel={handleTransientSidebarScroll}
        onTouchMove={handleTransientSidebarScroll}
        onScroll={handleSidebarScroll}
        onPointerDown={handleSidebarPointerDown}
        onPointerUp={handleSidebarPointerEnd}
        onPointerCancel={handleSidebarPointerEnd}
        onPointerLeave={handleSidebarPointerEnd}
      >
        {traces.length === 0 ? (
          <div className="text-muted-foreground px-3 py-6 text-center text-xs">
            {props.isLoadingMoreObservations
              ? "Loading observations..."
              : props.observationLoadError
                ? "Failed to load observations"
                : search
                  ? "No matching turns"
                  : "No turns"}
          </div>
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: "relative",
              width: "100%",
            }}
          >
            {virtualItems.map((virtualItem) => {
              const sidebarTrace = traces[virtualItem.index];
              if (!sidebarTrace) return null;
              const { trace } = sidebarTrace;
              const isCollapsed = !expandedTraceIds.has(trace.id);
              const gap = idleGapSeconds[virtualItem.index];
              return (
                <SessionVirtualizedRow
                  key={virtualItem.key}
                  itemKey={String(virtualItem.key)}
                  measurementKey={`${String(virtualItem.key)}:${isCollapsed}:${search}`}
                  source="modern"
                  virtualItem={virtualItem}
                  virtualizer={virtualizer}
                >
                  {gap !== null &&
                  gap !== undefined &&
                  gap >= IDLE_GAP_THRESHOLD_SECONDS ? (
                    <div className="my-0.5 mb-2 flex items-center bg-[repeating-linear-gradient(315deg,hsl(var(--foreground)/0.07)_0_1px,transparent_1px_5px)] px-3 py-[5px]">
                      <span className="text-muted-foreground font-mono text-[11px] whitespace-nowrap">
                        +{formatIdleGap(gap)} idle
                      </span>
                    </div>
                  ) : null}
                  <div className="px-1 pb-2">
                    <TurnCard
                      sidebarTrace={sidebarTrace}
                      selectIndex={sidebarTrace.turnNumber - 1}
                      isActive={trace.id === activeTraceId}
                      isCollapsed={isCollapsed}
                      onToggleCollapse={onToggleTraceExpanded}
                      onSelect={onSelect}
                      hasFilters={
                        search.trim() !== "" ||
                        filterControls.activeFilterCount > 0
                      }
                      onExcludeObservation={onExcludeObservation}
                    />
                  </div>
                </SessionVirtualizedRow>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
