import React, { useCallback, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type FilterState } from "@langfuse/shared";

import { LazySessionTraceEventsRow } from "@/src/components/session/LazySessionTraceEventsRow";
import { ConnectedModernSessionObservationList } from "@/src/components/session/ConnectedModernSessionObservationList";
import { SessionVirtualizedRow } from "@/src/components/session/SessionVirtualizedRow";
import { type EventSessionTrace } from "@/src/components/session/sessionDetailPageTypes";

const MODERN_SESSION_OVERSCAN = 5;
const EMPTY_TRACES: EventSessionTrace[] = [];

type OpenPeek = (id: string, row: EventSessionTrace) => void;

type ModernSessionProps = {
  tracesState:
    | { type: "loading" }
    | { type: "loaded"; traces: EventSessionTrace[] };
  projectId: string;
  sessionId: string;
  openPeek: OpenPeek;
  traceCommentCounts: Map<string, number> | undefined;
  filterState: FilterState;
  filterMeasurementKey: string;
  viewLabel: string | null;
  showInlineToolCalls: boolean;
  showSystemPrompt: boolean;
};

export function ModernSession({
  tracesState,
  projectId,
  sessionId,
  openPeek,
  traceCommentCounts,
  filterState,
  filterMeasurementKey,
  viewLabel,
  showInlineToolCalls,
  showSystemPrompt,
}: ModernSessionProps) {
  const traces =
    tracesState.type === "loaded" ? tracesState.traces : EMPTY_TRACES;
  const feedRef = useRef<HTMLDivElement>(null);
  const [selectedTraceId, setSelectedTraceId] = useState<string>();
  const virtualizer = useVirtualizer({
    count: traces.length,
    getScrollElement: () => feedRef.current,
    estimateSize: () => 520,
    overscan: MODERN_SESSION_OVERSCAN,
    getItemKey: (index) => traces[index]?.id ?? index,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const scrollOffset = virtualizer.scrollOffset ?? 0;
  const activeVirtualItem =
    virtualItems.find(
      (item) => item.start <= scrollOffset + 1 && item.end > scrollOffset + 1,
    ) ?? virtualItems.find((item) => item.start > scrollOffset);
  const scrollSpyTraceId =
    traces[activeVirtualItem?.index ?? 0]?.id ?? traces[0]?.id;
  const activeTraceId = selectedTraceId ?? scrollSpyTraceId;

  const scrollToTrace = useCallback(
    (index: number) => {
      const feed = feedRef.current;
      const offset = virtualizer.getOffsetForIndex(index, "start")?.[0];
      if (!feed || offset === undefined) return;
      // Native scrolling avoids TanStack's smooth-scroll retries against
      // dynamically measured rows stopping one row before the target.
      feed.scrollTo({ top: offset, behavior: "smooth" });
    },
    [virtualizer],
  );

  const selectTrace = useCallback(
    (index: number) => {
      const trace = traces[index];
      if (!trace) return;
      setSelectedTraceId(trace.id);
      scrollToTrace(index);
    },
    [scrollToTrace, traces],
  );

  const restoreScrollSpy = () => setSelectedTraceId(undefined);

  return (
    <div className="grid min-h-0 flex-1 grid-rows-[minmax(10rem,13rem)_minmax(0,1fr)] overflow-hidden lg:grid-cols-[300px_minmax(0,1fr)] lg:grid-rows-1">
      <ConnectedModernSessionObservationList
        state={
          tracesState.type === "loading"
            ? { type: "loading" }
            : {
                type: "loaded",
                traces,
                activeTraceId,
                onSelect: selectTrace,
              }
        }
        projectId={projectId}
        sessionId={sessionId}
        filterState={filterState}
      />
      <div
        ref={feedRef}
        className="min-h-0 overflow-y-auto scroll-smooth"
        onWheel={restoreScrollSpy}
        onTouchMove={restoreScrollSpy}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) restoreScrollSpy();
        }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualItems.map((virtualItem) => {
            const trace = traces[virtualItem.index];
            if (!trace) return null;

            return (
              <SessionVirtualizedRow
                key={virtualItem.key}
                itemKey={String(virtualItem.key)}
                measurementKey={`${String(virtualItem.key)}:${showInlineToolCalls}:${showSystemPrompt}:${filterMeasurementKey}`}
                source="modern"
                virtualItem={virtualItem}
                virtualizer={virtualizer}
              >
                <LazySessionTraceEventsRow
                  trace={trace}
                  projectId={projectId}
                  sessionId={sessionId}
                  openPeek={openPeek}
                  traceCommentCounts={traceCommentCounts}
                  index={virtualItem.index}
                  filterState={filterState}
                  viewLabel={viewLabel}
                  surface="modern"
                  contentMode={showInlineToolCalls ? "all" : "conversation"}
                  showSystemPrompt={showSystemPrompt}
                  isActive={trace.id === activeTraceId}
                />
              </SessionVirtualizedRow>
            );
          })}
        </div>
      </div>
    </div>
  );
}
