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
  const measurementStateRef = useRef(createStableVirtualRowMeasurementState());

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
    resizeCommittedHeight(measurementStateRef.current.commitPendingHeight());
  }, [resizeCommittedHeight]);

  const scheduleHeightCommit = useCallback(
    (height: number) => {
      cancelScheduledWork();

      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;

        if (latestIsScrollingRef.current) {
          measurementStateRef.current.setPendingHeight(height);
          return;
        }

        resizeCommittedHeight(measurementStateRef.current.commitHeight(height));
      });
    },
    [cancelScheduledWork, resizeCommittedHeight],
  );

  useEffect(() => {
    const itemKeyChanged = itemKeyRef.current !== itemKey;

    if (itemKeyChanged) {
      itemKeyRef.current = itemKey;
      cancelScheduledWork();
      measurementStateRef.current.reset();

      if (nodeRef.current) {
        scheduleHeightCommit(nodeRef.current.getBoundingClientRect().height);
      }

      return;
    }

    if (isScrolling || !measurementStateRef.current.hasPendingHeight()) {
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
