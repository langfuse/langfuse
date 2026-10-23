"use client";

import { useCallback, useRef } from "react";
import { BUILD_LEAD } from "./Frame";
import type { Playback } from "./usePlayback";

const prefersReducedMotion = () =>
  typeof matchMedia !== "undefined" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A ref callback that steps a text node from step(0) to step(1) over `duration` ms, `at` ms into each run. Frames
 * write to the text node directly, so a count never re-renders. A first build from hidden waits at step(0) until
 * it plays; reduced motion shows the final text.
 */
export function useStepper(
  playback: Pick<Playback, "runs" | "startsHidden">,
  at: number,
  duration: number,
  step: (progress: number) => string,
) {
  const { runs, startsHidden } = playback;
  const latestStep = useRef(step);
  latestStep.current = step;
  const finalText = step(1);

  return useCallback(
    (node: SVGTSpanElement | null) => {
      const text = node?.firstChild;
      if (!text || prefersReducedMotion()) return undefined;
      const stepAt = (progress: number) => latestStep.current(progress);
      if (startsHidden && runs <= 1) text.nodeValue = stepAt(0);
      if (runs === 0) return undefined;
      const frame = { id: 0 };
      const timer = window.setTimeout(
        () => {
          const start = performance.now();
          const tick = (now: number) => {
            const progress = Math.min(1, (now - start) / duration);
            text.nodeValue = stepAt(progress);
            if (progress < 1) frame.id = requestAnimationFrame(tick);
          };
          frame.id = requestAnimationFrame(tick);
        },
        at + (startsHidden && runs === 1 ? BUILD_LEAD : 0),
      );
      return () => {
        window.clearTimeout(timer);
        cancelAnimationFrame(frame.id);
        text.nodeValue = finalText;
      };
    },
    [runs, startsHidden, at, duration, finalText],
  );
}
