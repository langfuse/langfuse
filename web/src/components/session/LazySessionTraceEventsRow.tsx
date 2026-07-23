import React from "react";
import {
  TraceEventsRow,
  TraceEventsSkeleton,
  type TraceEventsSurface,
} from "@/src/components/session/TraceEventsRow";
import { useSessionDetailStore } from "@/src/components/session/SessionDetailStoreProvider";
import { type RouterOutputs } from "@/src/utils/api";
import { type FilterState } from "@langfuse/shared";
import { type IOPreviewContentMode } from "@/src/components/trace/components/IOPreview/IOPreview";

type LazySessionTraceEventsRowProps = {
  trace: RouterOutputs["sessions"]["tracesFromEvents"][number];
  projectId: string;
  sessionId: string;
  openPeek: (id: string, row: any) => void;
  index: number;
  traceCommentCounts: Map<string, number> | undefined;
  filterState: FilterState;
  viewLabel: string | null;
  hideTracePanel?: boolean;
  surface?: TraceEventsSurface;
  contentMode?: IOPreviewContentMode;
  showSystemPrompt?: boolean;
  isActive?: boolean;
  /** Idle gap (seconds) before this turn, for the feed's separators. */
  idleGapSeconds?: number | null;
  /** Selects the 0-based turn (rail sync + smooth scroll), kept stable. */
  onSelectTurnIndex?: (index: number) => void;
};

const LazySessionTraceEventsRowInner = (
  props: LazySessionTraceEventsRowProps,
) => {
  const { index, onSelectTurnIndex, ...rowProps } = props;
  const onSelectTurn = React.useCallback(
    () => onSelectTurnIndex?.(index),
    [onSelectTurnIndex, index],
  );
  const shouldLoad = useSessionDetailStore((state) =>
    Boolean(state.loadedTraceIds[props.trace.id]),
  );
  const showCorrections = useSessionDetailStore(
    (state) => state.showCorrections,
  );
  const markTraceLoaded = useSessionDetailStore(
    (state) => state.actions.markTraceLoaded,
  );
  const internalRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!internalRef.current || shouldLoad) return;
    return observe(internalRef.current, () => markTraceLoaded(props.trace.id));
  }, [markTraceLoaded, shouldLoad, props.trace.id]);

  const setRowRef = React.useCallback((node: HTMLDivElement | null) => {
    internalRef.current = node;
  }, []);

  const isModern = props.surface === "modern";

  return (
    <div
      ref={setRowRef}
      className={isModern ? undefined : "pb-3"}
      data-session-row-index={index}
    >
      {shouldLoad ? (
        <TraceEventsRow
          {...rowProps}
          showCorrections={showCorrections}
          turnNumber={index + 1}
          onSelectTurn={onSelectTurn}
        />
      ) : isModern ? (
        <div className="flex h-80 items-center justify-center px-6 py-8">
          <TraceEventsSkeleton />
        </div>
      ) : (
        <TraceEventsSkeleton />
      )}
    </div>
  );
};

LazySessionTraceEventsRowInner.displayName = "LazySessionTraceEventsRowInner";
export const LazySessionTraceEventsRow = React.memo(
  LazySessionTraceEventsRowInner,
);
LazySessionTraceEventsRow.displayName = "LazySessionTraceEventsRow";

const listeners = new Map<Element, () => void>();
let sharedObserver: IntersectionObserver;

function observe(element: Element, callback: () => void) {
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const cb = listeners.get(entry.target);
            cb?.();
          }
        });
      },
      { rootMargin: "400px" },
    );
  }

  listeners.set(element, callback);
  sharedObserver.observe(element);

  return () => {
    listeners.delete(element);
    sharedObserver.unobserve(element);
  };
}
