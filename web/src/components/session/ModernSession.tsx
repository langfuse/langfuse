import React, { useCallback, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type FilterState } from "@langfuse/shared";

import { ObservationInspector } from "@/src/components/session/inspector/ObservationInspector";
import { LazySessionTraceEventsRow } from "@/src/components/session/LazySessionTraceEventsRow";
import { ObservationList } from "@/src/components/session/ObservationList";
import { SessionVirtualizedRow } from "@/src/components/session/SessionVirtualizedRow";
import { type EventSessionTrace } from "@/src/components/session/sessionDetailPageTypes";
import { cn } from "@/src/utils/tailwind";

const MODERN_SESSION_OVERSCAN = 5;

type OpenPeek = (id: string, row: any) => void;

type ModernSessionProps = {
  traces: EventSessionTrace[];
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
  traces,
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
  const feedRef = useRef<HTMLDivElement>(null);
  const [selectedTraceId, setSelectedTraceId] = useState<string>();
  const [isSpanListOpen, setIsSpanListOpen] = useState(true);
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
      // TanStack retries smooth scrolls against dynamic row measurements and
      // can stop one row early. Native scrolling uses its measured target once
      // and preserves the requested smooth minimap navigation.
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
    <div
      className={cn(
        "relative grid min-h-0 flex-1 overflow-hidden lg:grid-rows-1",
        isSpanListOpen
          ? "grid-rows-[minmax(10rem,13rem)_minmax(0,1fr)] lg:grid-cols-[300px_minmax(0,1fr)]"
          : "grid-rows-[2.25rem_minmax(0,1fr)] lg:grid-cols-[36px_minmax(0,1fr)]",
      )}
    >
      <ObservationList
        traces={traces}
        projectId={projectId}
        sessionId={sessionId}
        filterState={filterState}
        activeTraceId={activeTraceId}
        onSelect={selectTrace}
        isOpen={isSpanListOpen}
        onToggleOpen={() => setIsSpanListOpen((current) => !current)}
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
      <ObservationInspector
        projectId={projectId}
        sessionId={sessionId}
        traces={traces}
        filterState={filterState}
        openPeek={openPeek}
      />
    </div>
  );
}
