import React, { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, Search } from "lucide-react";

import { type ObservationListRowsRenderer } from "@/src/components/session/ObservationListRows";
import { SessionVirtualizedRow } from "@/src/components/session/SessionVirtualizedRow";
import { type EventSessionTrace } from "@/src/components/session/sessionDetailPageTypes";
import {
  computeIdleGapSeconds,
  formatIdleGap,
  IDLE_GAP_THRESHOLD_SECONDS,
} from "@/src/components/session/sessionIdleGap";
import { Input } from "@/src/components/ui/input";
import { cn } from "@/src/utils/tailwind";

const OBSERVATION_LIST_OVERSCAN = 5;
const EMPTY_TRACES: EventSessionTrace[] = [];

const TurnCard = React.memo(
  ({
    trace,
    index,
    isActive,
    isSelected,
    isCollapsed,
    onToggleCollapse,
    onSelect,
    renderObservationRows,
    search,
  }: {
    trace: EventSessionTrace;
    index: number;
    isActive: boolean;
    isSelected: boolean;
    isCollapsed: boolean;
    onToggleCollapse: (traceId: string) => void;
    onSelect: (index: number) => void;
    renderObservationRows: ObservationListRowsRenderer;
    search: string;
  }) => (
    <div
      className={cn(
        "group hover:bg-foreground/[0.03] rounded-sm border border-transparent p-2 transition-colors duration-150",
        isActive && !isSelected && "bg-foreground/5",
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
        <span
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border font-mono text-[10px]",
            isSelected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-tertiary text-foreground",
          )}
        >
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

export function ModernSessionObservationList(
  props:
    | { state: "loading" }
    | {
        state: "loaded";
        traces: EventSessionTrace[];
        activeTraceId: string | undefined;
        selectedTraceId: string | undefined;
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

  const totalSpanCount = useMemo(
    () => traces.reduce((sum, trace) => sum + (trace.observationCount ?? 0), 0),
    [traces],
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
        className="relative flex h-full min-h-0 flex-col"
      >
        <div className="flex shrink-0 justify-end px-1 pt-4 pb-[7px]">
          <div className="bg-muted h-2.5 w-24 animate-pulse rounded-sm" />
        </div>
        <div className="flex shrink-0 items-center border-b px-1 pt-2.5 pb-3">
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

  const { activeTraceId, selectedTraceId, renderObservationRows, onSelect } =
    props;

  return (
    <div
      role="complementary"
      aria-label="Session spans"
      className="relative flex h-full min-h-0 flex-col"
    >
      <div className="flex shrink-0 justify-end px-1 pt-4 pb-[7px]">
        <span
          className="text-foreground-tertiary font-mono text-[10px]"
          title={`${traces.length} traces, ${totalSpanCount} spans`}
        >
          {traces.length} traces, {totalSpanCount} spans
        </span>
      </div>
      <div className="flex shrink-0 items-center border-b px-1 pt-2.5 pb-3">
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
                    isSelected={trace.id === selectedTraceId}
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
