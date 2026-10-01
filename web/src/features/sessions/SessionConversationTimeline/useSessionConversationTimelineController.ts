import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";
import { useElementSize } from "@/src/hooks/useElementSize";
import { useVirtualizedScrollSpy } from "@/src/hooks/useVirtualizedScrollSpy";

const SESSION_TIMELINE_OVERSCAN = 5;
export type SessionConversationTimelineScrollTarget = {
  traceId: string;
  observationId: string;
  requestId: number;
};

export function useSessionConversationTimelineController(
  traces: readonly { trace: EventSessionTrace }[],
) {
  const items = traces.map(({ trace }) => trace);
  const [feedRef, feedSize] = useElementSize<HTMLDivElement>();
  const virtualizer = useVirtualizer({
    count: traces.length,
    getScrollElement: () => feedRef.current,
    estimateSize: () => 520,
    overscan: SESSION_TIMELINE_OVERSCAN,
    getItemKey: (index) => traces[index]?.trace.id ?? index,
  });
  const {
    activeItemId,
    virtualItems,
    selectItem: selectTrace,
  } = useVirtualizedScrollSpy({
    items,
    virtualizer,
    scrollElementRef: feedRef,
    viewportHeight: feedSize?.height ?? 0,
    endTransitionRatio: 0.2,
  });
  const observationScrollCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => observationScrollCleanupRef.current?.(), []);

  const onSelect = (index: number, observationId?: string) => {
    observationScrollCleanupRef.current?.();
    observationScrollCleanupRef.current = null;
    selectTrace(index);
    if (!observationId) return;

    const feed = feedRef.current;
    const traceId = traces[index]?.trace.id;
    if (!feed || !traceId) return;

    const scrollToObservation = () => {
      const observation = Array.from(
        feed.querySelectorAll<HTMLElement>("[data-session-observation-id]"),
      ).find(
        (element) =>
          element.dataset.sessionObservationId === observationId &&
          element.closest<HTMLElement>("[data-session-trace-id]")?.dataset
            .sessionTraceId === traceId,
      );
      if (!observation) return false;

      const top =
        feed.scrollTop +
        observation.getBoundingClientRect().top -
        feed.getBoundingClientRect().top -
        Math.max(0, (feed.clientHeight - observation.clientHeight) / 2);
      feed.scrollTo({ top, behavior: "smooth" });
      return true;
    };

    if (scrollToObservation()) return;

    let timeout: number;
    const cleanup = () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };
    const observer = new MutationObserver(() => {
      if (!scrollToObservation()) return;
      cleanup();
      if (observationScrollCleanupRef.current === cleanup) {
        observationScrollCleanupRef.current = null;
      }
    });
    observer.observe(feed, { childList: true, subtree: true });
    timeout = window.setTimeout(() => {
      cleanup();
      if (observationScrollCleanupRef.current === cleanup) {
        observationScrollCleanupRef.current = null;
      }
    }, 5_000);
    observationScrollCleanupRef.current = cleanup;
  };

  return {
    activeTraceId: activeItemId ?? null,
    feedRef,
    onSelect,
    virtualItems,
    virtualizer,
  };
}

export type SessionConversationTimelineController = ReturnType<
  typeof useSessionConversationTimelineController
>;
