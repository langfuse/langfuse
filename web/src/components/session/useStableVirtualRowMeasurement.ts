import { useCallback, useEffect, useRef } from "react";
import { type Virtualizer } from "@tanstack/react-virtual";
import {
  createStableVirtualRowMeasurementState,
  STABLE_VIRTUAL_ROW_MEASUREMENT_CONFIG,
} from "@/src/components/session/stableVirtualRowMeasurementState";

type StableVirtualRowMeasurementOptions = {
  index: number;
  itemKey: string | number;
  isScrolling: boolean;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
};

type StableVirtualRowMeasurementStateApi = ReturnType<
  typeof createStableVirtualRowMeasurementState
>;

/**
 * Controlled row measurement for session detail virtualization.
 *
 * Use this instead of live `virtualizer.measureElement` for dynamic,
 * text-heavy rows where browser translation or async content can repeatedly
 * mutate DOM height while scrolling. It observes the row shell, defers commits
 * during active scroll, and clamps short-lived height oscillation before calling
 * `virtualizer.resizeItem`.
 *
 * Keep this session-local until another virtualized surface has the same
 * symptoms: dynamic row height, scroll jumps, or measurement churn. If that
 * happens, extract a shared hook with generic HTMLElement support, injectable
 * config, explicit unmount cleanup tests, and callsite-specific browser checks.
 */
export function useStableVirtualRowMeasurement({
  index,
  itemKey,
  isScrolling,
  virtualizer,
}: StableVirtualRowMeasurementOptions) {
  const observerRef = useRef<ResizeObserver | null>(null);
  const frameRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const latestIndexRef = useRef(index);
  const latestIsScrollingRef = useRef(isScrolling);
  const itemKeyRef = useRef(itemKey);
  const measurementStateRef =
    useRef<StableVirtualRowMeasurementStateApi | null>(null);

  if (measurementStateRef.current === null) {
    measurementStateRef.current = createStableVirtualRowMeasurementState();
  }

  const measurementState = measurementStateRef.current;

  latestIndexRef.current = index;
  latestIsScrollingRef.current = isScrolling;

  const cancelFrame = useCallback(() => {
    if (frameRef.current === null) return;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const cancelTimer = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const cancelScheduledWork = useCallback(() => {
    cancelFrame();
    cancelTimer();
  }, [cancelFrame, cancelTimer]);

  const resizeCommittedHeight = useCallback(
    (height: number | null) => {
      if (height === null) return;
      virtualizer.resizeItem(latestIndexRef.current, height);
    },
    [virtualizer],
  );

  const commitPendingHeight = useCallback(() => {
    resizeCommittedHeight(measurementState.commitPendingHeight());
  }, [measurementState, resizeCommittedHeight]);

  const scheduleHeightCommit = useCallback(
    (height: number) => {
      cancelScheduledWork();

      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;

        if (latestIsScrollingRef.current) {
          measurementState.setPendingHeight(height);
          return;
        }

        resizeCommittedHeight(measurementState.commitHeight(height));
      });
    },
    [cancelScheduledWork, measurementState, resizeCommittedHeight],
  );

  useEffect(() => {
    const itemKeyChanged = itemKeyRef.current !== itemKey;

    if (itemKeyChanged) {
      itemKeyRef.current = itemKey;
      cancelScheduledWork();
      measurementState.reset();

      if (nodeRef.current) {
        scheduleHeightCommit(nodeRef.current.getBoundingClientRect().height);
      }

      return cancelScheduledWork;
    }

    if (isScrolling || !measurementState.hasPendingHeight()) {
      return;
    }

    cancelTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;

      if (latestIsScrollingRef.current) return;

      commitPendingHeight();
    }, STABLE_VIRTUAL_ROW_MEASUREMENT_CONFIG.scrollIdleMs);

    return cancelTimer;
  }, [
    cancelScheduledWork,
    cancelTimer,
    commitPendingHeight,
    isScrolling,
    itemKey,
    measurementState,
    scheduleHeightCommit,
  ]);

  return useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      nodeRef.current = node;
      cancelScheduledWork();

      if (!node || typeof ResizeObserver === "undefined") return;

      observerRef.current = new ResizeObserver((entries) => {
        const entry = entries[0];
        const blockSize = entry.borderBoxSize?.[0]?.blockSize;

        scheduleHeightCommit(blockSize ?? entry.contentRect.height);
      });

      observerRef.current.observe(node);
      scheduleHeightCommit(node.getBoundingClientRect().height);
    },
    [cancelScheduledWork, scheduleHeightCommit],
  );
}
