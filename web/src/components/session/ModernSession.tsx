import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type FilterState } from "@langfuse/shared";

import { ObservationInspector } from "@/src/components/session/inspector/ObservationInspector";
import { LazySessionTraceEventsRow } from "@/src/components/session/LazySessionTraceEventsRow";
import { ObservationList } from "@/src/components/session/ObservationList";
import { SessionVirtualizedRow } from "@/src/components/session/SessionVirtualizedRow";
import {
  useSessionDetailStore,
  useSessionDetailStoreApi,
} from "@/src/components/session/SessionDetailStoreProvider";
import { type EventSessionTrace } from "@/src/components/session/sessionDetailPageTypes";
import { computeIdleGapSeconds } from "@/src/components/session/sessionIdleGap";
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
  // Row heights change with the generation view — remeasure on switch.
  const generationView = useSessionDetailStore((state) => state.generationView);
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

  // Idle gap before each turn (index 0 has none) for the feed's separators.
  const idleGapSeconds = useMemo(
    () =>
      traces.map((trace, index) =>
        index === 0 ? null : computeIdleGapSeconds(traces[index - 1], trace),
      ),
    [traces],
  );

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

  const storeApi = useSessionDetailStoreApi();
  const selectTrace = useCallback(
    (index: number) => {
      const trace = traces[index];
      if (!trace) return;
      setSelectedTraceId(trace.id);
      scrollToTrace(index);
      // Rail ↔ transcript ↔ inspector selection sync: an OPEN inspector
      // follows the turn selection (retargeting to the new turn at trace
      // level). Span-row clicks retarget again right after — last write wins.
      const { inspectedObservation, actions } = storeApi.getState();
      if (inspectedObservation && inspectedObservation.traceId !== trace.id) {
        actions.openInspector({ traceId: trace.id, observationId: null });
      }
    },
    [scrollToTrace, storeApi, traces],
  );

  const restoreScrollSpy = () => setSelectedTraceId(undefined);

  // `↑`/`↓` AND `j`/`k` move the selected turn (the rail's advertised
  // shortcuts). Session paging keeps its header buttons only on this page —
  // DetailPageNav's j/k listener is disabled (keyboardShortcuts={false}) so
  // the two never fight over the same keys. The window is the external
  // system here; the refs keep the listener stable across scroll-spy churn.
  // Skipped while typing or inside open overlays.
  const activeTraceIdRef = useRef(activeTraceId);
  activeTraceIdRef.current = activeTraceId;
  const tracesRef = useRef(traces);
  tracesRef.current = traces;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isNext = event.key === "ArrowDown" || event.key === "j";
      const isPrevious = event.key === "ArrowUp" || event.key === "k";
      if (!isNext && !isPrevious) return;
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input,textarea,select,[contenteditable='true'],[role='menu'],[role='listbox'],[role='dialog']",
        )
      )
        return;
      const currentTraces = tracesRef.current;
      const currentIndex = currentTraces.findIndex(
        (trace) => trace.id === activeTraceIdRef.current,
      );
      const nextIndex = isNext
        ? Math.min(currentTraces.length - 1, Math.max(0, currentIndex + 1))
        : Math.max(0, currentIndex - 1);
      if (nextIndex === currentIndex) return;
      event.preventDefault();
      selectTrace(nextIndex);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectTrace]);

  return (
    <div
      className={cn(
        // Workspace chrome per the mock: paper canvas, 16px left/bottom
        // inset, transcript flush to the right edge. Dark = #171714 base
        // chrome (one step above the recessed transcript plane).
        "bg-background dark:bg-header relative grid min-h-0 flex-1 gap-x-4 overflow-hidden pb-4 pl-4 lg:grid-rows-1",
        isSpanListOpen
          ? "grid-rows-[minmax(10rem,13rem)_minmax(0,1fr)] lg:grid-cols-[clamp(200px,24vw,296px)_minmax(0,1fr)]"
          : "grid-rows-[2.25rem_minmax(0,1fr)] lg:grid-cols-[36px_minmax(0,1fr)]",
      )}
    >
      <ObservationList
        traces={traces}
        projectId={projectId}
        sessionId={sessionId}
        filterState={filterState}
        activeTraceId={activeTraceId}
        selectedTraceId={selectedTraceId}
        onSelect={selectTrace}
        onOpenPeek={(trace) => openPeek(trace.id, trace)}
        isOpen={isSpanListOpen}
        onToggleOpen={() => setIsSpanListOpen((current) => !current)}
      />
      {/* Conversation — a full-bleed plane split off by one hairline
          (mock: plane-conv white / #121210 with border-left only). */}
      <div className="bg-card dark:bg-background relative min-h-0 min-w-[320px] border-l">
        <div
          ref={feedRef}
          className="h-full min-h-0 overflow-y-auto scroll-smooth"
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
                  measurementKey={`${String(virtualItem.key)}:${showInlineToolCalls}:${showSystemPrompt}:${filterMeasurementKey}:${generationView}`}
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
                    idleGapSeconds={idleGapSeconds[virtualItem.index]}
                    onSelectTurnIndex={selectTrace}
                  />
                </SessionVirtualizedRow>
              );
            })}
          </div>
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
