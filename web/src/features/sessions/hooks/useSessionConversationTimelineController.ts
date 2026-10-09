import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";
import { useElementSize } from "@/src/hooks/useElementSize";
import { STABLE_VIRTUAL_ROW_MEASUREMENT_CONFIG } from "@/src/features/sessions/stableVirtualRowMeasurementState";
import {
  getScrollOffsetForScrollSpyAnchor,
  getScrollSpyAnchor,
  useVirtualizedScrollSpy,
} from "@/src/hooks/useVirtualizedScrollSpy";

const SESSION_TIMELINE_OVERSCAN = 5;
const SESSION_TIMELINE_ANCHOR_RATIO = 0.2;
const SESSION_TIMELINE_SCROLL_TIME_CONSTANT_MS = 80;
const SESSION_TIMELINE_MAX_FRAME_ELAPSED_MS = 64;
export type SessionConversationTimelineScrollTarget = {
  itemId?: string;
  traceId: string;
  observationId: string;
  rowId?: string;
  requestId: number;
};

export function useSessionConversationTimelineController(
  traces: readonly { trace: EventSessionTrace; itemId?: string }[],
  onVisibleTraceIdsChange?: (traceIds: string[]) => void,
) {
  const items = traces.map(({ trace, itemId }) => ({
    ...trace,
    id: itemId ?? trace.id,
  }));
  const [feedRef, feedSize] = useElementSize<HTMLDivElement>();
  const viewportHeight = feedSize
    ? (feedRef.current?.clientHeight ?? feedSize.height)
    : 0;
  const virtualizer = useVirtualizer({
    count: traces.length,
    getScrollElement: () => feedRef.current,
    estimateSize: () => 520,
    overscan: SESSION_TIMELINE_OVERSCAN,
    getItemKey: (index) =>
      traces[index]?.itemId ?? traces[index]?.trace.id ?? index,
    onChange: (instance) => {
      onVisibleTraceIdsChange?.([
        ...new Set(
          instance.getVirtualItems().flatMap((item) => {
            const traceId = traces[item.index]?.trace.id;
            return traceId ? [traceId] : [];
          }),
        ),
      ]);
    },
  });
  const { activeItemId, virtualItems } = useVirtualizedScrollSpy({
    items,
    virtualizer,
    scrollElementRef: feedRef,
    viewportHeight,
    endTransitionRatio: 0.2,
    viewportInset: viewportHeight * SESSION_TIMELINE_ANCHOR_RATIO,
  });
  const [selection, setSelection] = useState<{
    itemId: string;
    fallbackOffset?: number;
  } | null>(null);
  const navigationCleanupRef = useRef<(() => void) | null>(null);
  const latestTracesRef = useRef(traces);
  useLayoutEffect(() => {
    latestTracesRef.current = traces;
  }, [traces]);
  useEffect(() => () => navigationCleanupRef.current?.(), []);

  useEffect(() => {
    const feed = feedRef.current;
    const fallbackOffset = selection?.fallbackOffset;
    if (!feed || fallbackOffset === undefined) return;
    const clearFallback = () => {
      if (
        Math.abs(feed.scrollTop - fallbackOffset) >
        Math.min(96, feed.clientHeight * 0.1)
      ) {
        navigationCleanupRef.current?.();
        navigationCleanupRef.current = null;
        setSelection(null);
      }
    };
    feed.addEventListener("scroll", clearFallback, { passive: true });
    return () => feed.removeEventListener("scroll", clearFallback);
  }, [feedRef, selection]);

  const onSelect = (index: number, observationId?: string, rowId?: string) => {
    navigationCleanupRef.current?.();
    navigationCleanupRef.current = null;
    setSelection(null);
    const feed = feedRef.current;
    const traceId = traces[index]?.trace.id;
    const itemId = traces[index]?.itemId ?? traceId;
    if (!feed || !traceId) return;
    if (!itemId) return;
    setSelection({ itemId });

    let frame = 0;
    let timeout = 0;
    let previousTarget: number | undefined;
    let stableSince = performance.now();
    let previousScrollTop = feed.scrollTop;
    let previousFrameTime = performance.now();
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let stopped = false;
    const cleanup = () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      feed.removeEventListener("wheel", cancel);
      feed.removeEventListener("touchstart", cancel);
      feed.removeEventListener("pointerdown", cancel);
      feed.removeEventListener("keydown", cancelOnKey);
    };
    const cancel = () => {
      cleanup();
      navigationCleanupRef.current = null;
      feed.scrollTo({ top: feed.scrollTop, behavior: "instant" });
      setSelection(null);
    };
    const cancelOnKey = (event: KeyboardEvent) => {
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "PageUp",
          "PageDown",
          "Home",
          "End",
          " ",
        ].includes(event.key) &&
        !(
          event.target instanceof HTMLElement &&
          event.target.closest("input, textarea, [contenteditable=true]")
        )
      ) {
        cancel();
      }
    };
    feed.addEventListener("wheel", cancel, { passive: true });
    feed.addEventListener("touchstart", cancel, { passive: true });
    feed.addEventListener("pointerdown", cancel, { passive: true });
    feed.addEventListener("keydown", cancelOnKey);
    navigationCleanupRef.current = cleanup;

    const correctPosition = () => {
      if (stopped) return;
      const currentTraces = latestTracesRef.current;
      let currentIndex = currentTraces.findIndex(
        (item) => (item.itemId ?? item.trace.id) === itemId,
      );
      // A loading placeholder can split into independently virtualized threads.
      if (currentIndex === -1 && itemId === traceId) {
        currentIndex = currentTraces.findIndex(
          (item) => item.trace.id === traceId,
        );
      }
      if (currentIndex === -1) {
        cleanup();
        navigationCleanupRef.current = null;
        setSelection(null);
        return;
      }
      const currentItemId = currentTraces[currentIndex]!.itemId ?? traceId;
      const entry = Array.from(
        feed.querySelectorAll<HTMLElement>("[data-session-trace-id]"),
      ).find(
        (element) =>
          element.dataset.sessionTraceId === traceId &&
          (!element.dataset.sessionItemId ||
            element.dataset.sessionItemId === currentItemId),
      );
      const row =
        entry && (rowId || observationId)
          ? Array.from(
              entry.querySelectorAll<HTMLElement>(
                "[data-session-transcript-row-id], [data-session-observation-id]",
              ),
            ).find((element) =>
              rowId
                ? element.dataset.sessionTranscriptRowId === rowId
                : element.dataset.sessionObservationId === observationId,
            )
          : undefined;
      const mountedTarget = rowId || observationId ? row : entry;
      const measurements = virtualizer.measurementsCache;
      const itemOffset = measurements[currentIndex]?.start;
      if (itemOffset === undefined) {
        frame = window.requestAnimationFrame(correctPosition);
        return;
      }
      const anchor = row
        ? feed.scrollTop +
          row.getBoundingClientRect().top -
          feed.getBoundingClientRect().top -
          feed.clientTop
        : itemOffset;
      const viewportHeight = feed.clientHeight;
      const totalSize = virtualizer.getTotalSize();
      const top = getScrollOffsetForScrollSpyAnchor({
        anchor,
        viewportHeight,
        totalSize,
        endTransitionRatio: 0.2,
        viewportInset: viewportHeight * SESSION_TIMELINE_ANCHOR_RATIO,
      });
      const targetChanged =
        previousTarget === undefined || Math.abs(previousTarget - top) > 1;
      if (targetChanged) {
        previousTarget = top;
        stableSince = performance.now();
      }
      const now = performance.now();
      const elapsed = Math.min(
        SESSION_TIMELINE_MAX_FRAME_ELAPSED_MS,
        Math.max(0, now - previousFrameTime),
      );
      previousFrameTime = now;
      // Retarget each frame as virtual rows mount and resize, without restarting
      // a browser smooth-scroll animation or relying on estimated row heights.
      const distance = top - feed.scrollTop;
      // Integer scroll positions would otherwise stall on subpixel steps.
      const step = Math.min(
        Math.abs(distance),
        Math.max(
          elapsed > 0 ? 1 : 0,
          Math.abs(distance) *
            (1 - Math.exp(-elapsed / SESSION_TIMELINE_SCROLL_TIME_CONSTANT_MS)),
        ),
      );
      const nextTop =
        reduceMotion || Math.abs(distance) <= 1
          ? top
          : feed.scrollTop + Math.sign(distance) * step;
      if (reduceMotion ? targetChanged : nextTop !== feed.scrollTop) {
        feed.scrollTo({ top: nextTop, behavior: "instant" });
      }
      if (
        virtualizer.isScrolling ||
        Math.abs(previousScrollTop - feed.scrollTop) > 0.5
      ) {
        previousScrollTop = feed.scrollTop;
        stableSince = performance.now();
      }
      if (
        mountedTarget &&
        Math.abs(feed.scrollTop - top) <= 1 &&
        performance.now() - stableSince >=
          STABLE_VIRTUAL_ROW_MEASUREMENT_CONFIG.scrollIdleMs + 50
      ) {
        const actualAnchor = getScrollSpyAnchor({
          scrollOffset: feed.scrollTop,
          viewportHeight,
          totalSize,
          endTransitionRatio: 0.2,
          viewportInset: viewportHeight * SESSION_TIMELINE_ANCHOR_RATIO,
        });
        const nextOffset = measurements[currentIndex + 1]?.start ?? totalSize;
        const minimumAnchor = getScrollSpyAnchor({
          scrollOffset: 0,
          viewportHeight,
          totalSize,
          endTransitionRatio: 0.2,
          viewportInset: viewportHeight * SESSION_TIMELINE_ANCHOR_RATIO,
        });
        const maximumAnchor = getScrollSpyAnchor({
          scrollOffset: Math.max(0, totalSize - viewportHeight),
          viewportHeight,
          totalSize,
          endTransitionRatio: 0.2,
          viewportInset: viewportHeight * SESSION_TIMELINE_ANCHOR_RATIO,
        });
        const canRepresentSelection =
          itemOffset <= maximumAnchor && nextOffset > minimumAnchor;
        if (canRepresentSelection && actualAnchor < itemOffset) {
          // Browser scroll positions can round just below an entry boundary.
          feed.scrollTo({
            top: Math.min(top + 1, Math.max(0, totalSize - viewportHeight)),
            behavior: "instant",
          });
        }
        cleanup();
        navigationCleanupRef.current = null;
        if (
          !canRepresentSelection &&
          (actualAnchor < itemOffset || actualAnchor >= nextOffset)
        ) {
          setSelection({
            itemId: currentItemId,
            fallbackOffset: feed.scrollTop,
          });
        } else {
          setSelection(null);
        }
        return;
      }
      frame = window.requestAnimationFrame(correctPosition);
    };
    timeout = window.setTimeout(cancel, 5_000);
    correctPosition();
  };

  const selectedItem = selection
    ? (traces.find(
        (item) => (item.itemId ?? item.trace.id) === selection.itemId,
      ) ?? traces.find((item) => item.trace.id === selection.itemId))
    : undefined;
  const selectedIndex = selectedItem ? traces.indexOf(selectedItem) : -1;
  const selectedStart = virtualizer.measurementsCache[selectedIndex]?.start;
  const totalSize = virtualizer.getTotalSize();
  const selectedEnd =
    virtualizer.measurementsCache[selectedIndex + 1]?.start ?? totalSize;
  const minimumAnchor = getScrollSpyAnchor({
    scrollOffset: 0,
    viewportHeight,
    totalSize,
    endTransitionRatio: 0.2,
    viewportInset: viewportHeight * SESSION_TIMELINE_ANCHOR_RATIO,
  });
  const maximumAnchor = getScrollSpyAnchor({
    scrollOffset: Math.max(0, totalSize - viewportHeight),
    viewportHeight,
    totalSize,
    endTransitionRatio: 0.2,
    viewportInset: viewportHeight * SESSION_TIMELINE_ANCHOR_RATIO,
  });
  const fallbackIsNeeded =
    selectedStart !== undefined &&
    (selectedStart > maximumAnchor || selectedEnd <= minimumAnchor);
  return {
    activeItemId:
      selection &&
      selectedItem &&
      (selection.fallbackOffset === undefined || fallbackIsNeeded)
        ? (selectedItem.itemId ?? selectedItem.trace.id)
        : (activeItemId ?? null),
    feedRef,
    onSelect,
    virtualItems,
    virtualizer,
  };
}

export type SessionConversationTimelineController = ReturnType<
  typeof useSessionConversationTimelineController
>;
