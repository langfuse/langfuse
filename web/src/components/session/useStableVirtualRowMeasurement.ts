import { useCallback, useEffect, useRef } from "react";
import { type Virtualizer } from "@tanstack/react-virtual";

const SCROLL_IDLE_MS = 150;
const OSCILLATION_WINDOW_MS = 1_000;
const MAX_OSCILLATION_COUNT = 4;

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
  const pendingHeightRef = useRef<number | null>(null);
  const latestIndexRef = useRef(index);
  const latestIsScrollingRef = useRef(isScrolling);
  const committedHeightRef = useRef<number | null>(null);
  const previousObservedHeightRef = useRef<number | null>(null);
  const oscillationPairRef = useRef<[number, number] | null>(null);
  const oscillationCountRef = useRef(0);
  const oscillationWindowStartedAtRef = useRef(0);
  const frozenMinHeightRef = useRef<number | null>(null);

  useEffect(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    committedHeightRef.current = null;
    previousObservedHeightRef.current = null;
    oscillationPairRef.current = null;
    oscillationCountRef.current = 0;
    oscillationWindowStartedAtRef.current = 0;
    frozenMinHeightRef.current = null;
    pendingHeightRef.current = null;
  }, [itemKey]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      observerRef.current?.disconnect();
    };
  }, []);

  const commitHeight = useCallback(
    (rawHeight: number) => {
      const roundedHeight = Math.ceil(rawHeight);
      if (roundedHeight <= 0) return;

      const now = Date.now();
      const previousObservedHeight = previousObservedHeightRef.current;

      if (
        previousObservedHeight !== null &&
        previousObservedHeight !== roundedHeight
      ) {
        const nextPair: [number, number] = [
          Math.min(previousObservedHeight, roundedHeight),
          Math.max(previousObservedHeight, roundedHeight),
        ];
        const previousPair = oscillationPairRef.current;

        if (
          now - oscillationWindowStartedAtRef.current > OSCILLATION_WINDOW_MS ||
          !previousPair ||
          previousPair[0] !== nextPair[0] ||
          previousPair[1] !== nextPair[1]
        ) {
          oscillationWindowStartedAtRef.current = now;
          oscillationPairRef.current = nextPair;
          oscillationCountRef.current = 1;
        } else {
          oscillationCountRef.current += 1;
        }
      }

      previousObservedHeightRef.current = roundedHeight;

      const committedHeight = committedHeightRef.current;
      if (
        oscillationCountRef.current >= MAX_OSCILLATION_COUNT &&
        committedHeight !== null
      ) {
        frozenMinHeightRef.current = Math.max(committedHeight, roundedHeight);
      }

      const frozenMinHeight = frozenMinHeightRef.current;
      const nextHeight =
        frozenMinHeight === null
          ? roundedHeight
          : Math.max(frozenMinHeight, roundedHeight);

      if (
        committedHeight !== null &&
        Math.abs(committedHeight - nextHeight) < 1
      ) {
        return;
      }

      committedHeightRef.current = nextHeight;
      virtualizer.resizeItem(latestIndexRef.current, nextHeight);
    },
    [virtualizer],
  );

  const scheduleHeightCommit = useCallback(
    (height: number) => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      if (timerRef.current !== null) clearTimeout(timerRef.current);

      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;

        if (latestIsScrollingRef.current) {
          pendingHeightRef.current = height;
          return;
        }

        pendingHeightRef.current = null;
        commitHeight(height);
      });
    },
    [commitHeight],
  );

  useEffect(() => {
    latestIndexRef.current = index;
    latestIsScrollingRef.current = isScrolling;

    if (isScrolling || pendingHeightRef.current === null) return;

    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;

      if (latestIsScrollingRef.current) return;

      const pendingHeight = pendingHeightRef.current;
      pendingHeightRef.current = null;
      if (pendingHeight !== null) commitHeight(pendingHeight);
    }, SCROLL_IDLE_MS);

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [commitHeight, index, isScrolling]);

  return useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;

      if (!node || typeof ResizeObserver === "undefined") return;

      observerRef.current = new ResizeObserver((entries) => {
        const entry = entries[0];
        const blockSize = entry.borderBoxSize?.[0]?.blockSize;

        scheduleHeightCommit(blockSize ?? entry.contentRect.height);
      });

      observerRef.current.observe(node);
      scheduleHeightCommit(node.getBoundingClientRect().height);
    },
    [scheduleHeightCommit],
  );
}
