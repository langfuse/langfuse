import React, { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown } from "lucide-react";

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
        "bg-background mb-2 overflow-hidden rounded-sm border",
        isActive && "ring-primary/60 border-primary/60 ring-1",
      )}
      data-observation-list-active={isActive}
    >
      <button
        type="button"
        onClick={() => onSelect(index)}
        className={cn(
          "flex w-full items-center gap-2 px-2.5 py-2 text-left",
          isActive && "bg-primary/5",
        )}
        aria-current={isActive ? "true" : undefined}
      >
        <span
          className={cn(
            "shrink-0 rounded-sm border px-1.5 py-px font-mono text-[9px] font-bold",
            isActive
              ? "border-primary/50 bg-primary/10 text-primary"
              : "bg-muted/50 text-muted-foreground",
          )}
        >
          {index + 1}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-xs font-bold"
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
          className="hover:bg-muted flex h-5 w-5 shrink-0 items-center justify-center rounded-sm"
        >
          <ChevronDown
            className={cn(
              "text-muted-foreground h-3.5 w-3.5 transition-transform",
              isCollapsed ? "-rotate-90" : "rotate-0",
            )}
          />
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
        className="bg-background flex h-full min-h-0 flex-col border-r"
      >
        <div className="flex shrink-0 items-center gap-1.5 border-b p-2">
          <div className="bg-muted h-7 flex-1 animate-pulse rounded-sm" />
        </div>
        <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
          <div className="bg-muted h-2.5 w-14 animate-pulse rounded-sm" />
          <div className="bg-muted h-2.5 w-5 animate-pulse rounded-sm" />
        </div>
        <div className="bg-muted/40 flex min-h-0 flex-1 flex-col gap-2 p-2">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="bg-background flex flex-col gap-2 rounded-sm border p-2.5"
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

  const { activeTraceId, renderObservationRows, onSelect } = props;

  return (
    <div
      role="complementary"
      aria-label="Session spans"
      className="bg-background flex h-full min-h-0 flex-col border-r"
    >
      <div className="flex shrink-0 items-center gap-1.5 border-b p-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search spans"
          placeholder="Search spans..."
          className="h-7 flex-1 text-xs"
        />
      </div>
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-1.5">
        <span className="text-muted-foreground font-mono text-[9px] font-bold tracking-[0.08em] uppercase">
          All spans
        </span>
        <span className="text-muted-foreground font-mono text-[10px]">
          {totalSpanCount}
        </span>
      </div>
      <div
        ref={listRef}
        className="bg-muted/40 min-h-0 flex-1 overflow-y-auto p-2"
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
              </SessionVirtualizedRow>
            );
          })}
        </div>
      </div>
    </div>
  );
}
