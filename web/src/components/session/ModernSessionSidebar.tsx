import React, { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Check,
  ChevronDown,
  Filter,
  ListFilter,
  Pencil,
  Save,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { type FilterState, type TableViewPresetState } from "@langfuse/shared";

import { type ObservationListRowsRenderer } from "@/src/components/session/ObservationListRows";
import { SessionVirtualizedRow } from "@/src/components/session/SessionVirtualizedRow";
import { type EventSessionTrace } from "@/src/components/session/sessionDetailPageTypes";
import { type ModernSessionObservationIdentity } from "@/src/components/session/modernSessionObservationFilters";
import {
  SESSION_DETAIL_SYSTEM_PRESETS,
  SESSION_DETAIL_VIEW_TRIGGER_ID,
} from "@/src/components/session/session-detail-presets";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { InlineFilterState } from "@/src/features/filters/components/filter-builder";
import { FilterToken } from "@/src/features/filters/components/FilterToken";
import { ComposerTokens } from "@/src/features/search-bar/components/ComposerTokens";
import { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";
import { cn } from "@/src/utils/tailwind";

const OBSERVATION_LIST_OVERSCAN = 5;
const EMPTY_TRACES: EventSessionTrace[] = [];

export type ModernSessionSidebarFilterControls = {
  activeFilterCount: number;
  activeFilters: FilterState;
  activeExclusions: ModernSessionObservationIdentity[];
  activeViewName: string | undefined;
  selectedViewId: string | null;
  matchingSystemPresetId: string | undefined;
  matchingSavedViewId: string | undefined;
  savedViews: Array<TableViewPresetState & { id: string; name: string }>;
  onApplyPreset: (
    preset: (typeof SESSION_DETAIL_SYSTEM_PRESETS)[number],
  ) => void;
  onApplySavedView: (
    view: TableViewPresetState & { id: string; name: string },
  ) => void;
  onManageViews: () => void;
  onOpenFilterDialog: () => void;
  onClearFilters: () => void;
};

const TurnCard = React.memo(
  ({
    trace,
    index,
    isActive,
    isCollapsed,
    onToggleCollapse,
    onSelect,
    renderObservationRows,
    search,
  }: {
    trace: EventSessionTrace;
    index: number;
    isActive: boolean;
    isCollapsed: boolean;
    onToggleCollapse: (traceId: string) => void;
    onSelect: (index: number) => void;
    renderObservationRows: ObservationListRowsRenderer;
    search: string;
  }) => (
    <div
      className={cn(
        "group hover:bg-foreground/[0.03] rounded-sm border border-transparent p-2 transition-colors duration-150",
        isActive && "bg-foreground/5",
      )}
      data-observation-list-active={isActive}
    >
      <button
        type="button"
        onClick={() => onSelect(index)}
        className="flex w-full items-center gap-2 text-left"
        aria-current={isActive ? "true" : undefined}
      >
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
          className="text-muted-foreground flex h-3.5 w-3.5 shrink-0 items-center justify-center"
        >
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-transform duration-150",
              isCollapsed ? "-rotate-90" : "rotate-0",
            )}
            strokeWidth={1.6}
          />
        </span>
        <span className="border-border bg-tertiary text-foreground flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border font-mono text-[10px]">
          {index + 1}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-[13px] font-bold"
          title={trace.name ?? "Trace"}
        >
          {trace.name ?? "Trace"}
        </span>
      </button>
      {!isCollapsed
        ? renderObservationRows({
            traceId: trace.id,
            search,
            onSelectTurn: () => onSelect(index),
          })
        : null}
    </div>
  ),
);
TurnCard.displayName = "TurnCard";

export function ModernSessionSidebar(
  props:
    | { state: "loading" }
    | {
        state: "loaded";
        traces: EventSessionTrace[];
        activeTraceId: string | undefined;
        filterControls: ModernSessionSidebarFilterControls;
        renderObservationRows: ObservationListRowsRenderer;
        onSelect: (index: number) => void;
      },
) {
  const traces = props.state === "loaded" ? props.traces : EMPTY_TRACES;
  const listRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [collapsedTurns, setCollapsedTurns] = useState<Record<string, true>>(
    {},
  );

  const idleGapSeconds = useMemo(
    () =>
      traces.map((trace, index) =>
        index === 0 ? null : computeIdleGapSeconds(traces[index - 1], trace),
      ),
    [traces],
  );

  const toggleCollapse = (traceId: string) =>
    setCollapsedTurns((current) => {
      const next = { ...current };
      if (next[traceId]) delete next[traceId];
      else next[traceId] = true;
      return next;
    });

  const virtualizer = useVirtualizer({
    count: traces.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 160,
    overscan: OBSERVATION_LIST_OVERSCAN,
    getItemKey: (index) => traces[index]?.id ?? index,
  });

  if (props.state === "loading") {
    return (
      <div
        role="complementary"
        aria-label="Session spans"
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

  const { activeTraceId, filterControls, renderObservationRows, onSelect } =
    props;
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
    activeFilterQuery.text ||
    activeFilterQuery.skippedFilters.length > 0 ||
    filterControls.activeExclusions.length > 0,
  );

  return (
    <div
      role="complementary"
      aria-label="Session spans"
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
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search spans"
              placeholder="Search spans"
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
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Presets</DropdownMenuLabel>
              {SESSION_DETAIL_SYSTEM_PRESETS.map((preset) => (
                <DropdownMenuItem
                  key={preset.id}
                  onSelect={() => filterControls.onApplyPreset(preset)}
                  className="items-start gap-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{preset.name}</span>
                    {preset.description ? (
                      <span className="text-muted-foreground block text-xs">
                        {preset.description}
                      </span>
                    ) : null}
                  </span>
                  {filterControls.matchingSystemPresetId === preset.id ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : null}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Save className="mr-2 h-4 w-4" />
                  Saved Views
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56">
                  {filterControls.savedViews.map((view) => (
                    <DropdownMenuItem
                      key={view.id}
                      onSelect={() => filterControls.onApplySavedView(view)}
                    >
                      <span
                        className="min-w-0 flex-1 truncate"
                        title={view.name}
                      >
                        {view.name}
                      </span>
                      {filterControls.matchingSavedViewId === view.id ? (
                        <Check className="ml-2 h-4 w-4 shrink-0" />
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                  {filterControls.savedViews.length === 0 ? (
                    <DropdownMenuItem disabled>No saved views</DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={filterControls.onManageViews}>
                    <Settings2 className="mr-2 h-4 w-4" />
                    Manage Views
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={filterControls.onOpenFilterDialog}>
                <Filter className="mr-2 h-4 w-4" />
                Apply custom filter
              </DropdownMenuItem>
            </DropdownMenuContent>
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
                      {filterControls.activeExclusions.map((exclusion) => (
                        <span
                          key={`${exclusion.type}:${exclusion.name}`}
                          className="text-xs whitespace-nowrap"
                        >
                          <FilterToken deactivated={false} title={undefined}>
                            <span className="text-muted-foreground">
                              Exclude{" "}
                            </span>
                            <span className="text-qlang-field">
                              {exclusion.type}
                            </span>
                            <span className="text-muted-foreground">: </span>
                            <span className="text-qlang-value">
                              {exclusion.name}
                            </span>
                          </FilterToken>
                        </span>
                      ))}
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
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto px-1 pt-0.5 pb-4"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: "relative",
            width: "100%",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const trace = traces[virtualItem.index];
            if (!trace) return null;
            const isCollapsed = Boolean(collapsedTurns[trace.id]);
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
                  <div className="my-0.5 mb-2 flex items-center rounded-sm bg-[repeating-linear-gradient(315deg,hsl(var(--foreground)/0.07)_0_1px,transparent_1px_5px)] px-2 py-[5px]">
                    <span className="text-muted-foreground font-mono text-[11px] whitespace-nowrap">
                      +{formatIdleGap(gap)} idle
                    </span>
                  </div>
                ) : null}
                <div className="pb-2">
                  <TurnCard
                    trace={trace}
                    index={virtualItem.index}
                    isActive={trace.id === activeTraceId}
                    isCollapsed={isCollapsed}
                    onToggleCollapse={toggleCollapse}
                    onSelect={onSelect}
                    renderObservationRows={renderObservationRows}
                    search={search}
                  />
                </div>
              </SessionVirtualizedRow>
            );
          })}
        </div>
      </div>
    </div>
  );
}
