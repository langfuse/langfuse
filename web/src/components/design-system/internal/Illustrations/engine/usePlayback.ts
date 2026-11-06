"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";

/** What plays a run: inView once when it scrolls into view, hover on each pointer entry or focus moving in. */
export type PlayTrigger = "inView" | "hover" | "off";

export type Playback = {
  /** 0 until the trigger first fires, then +1 per play; groups keyed on it replay their CSS animations. */
  runs: number;
  /** The first run builds from a hidden frame, so values wait at their start until it plays. */
  startsHidden: boolean;
  /** Ref callback for the art: starts the observer or the hover and focus listeners. */
  observe: (node: Element | null) => (() => void) | undefined;
};

/** Ancestors with this attribute pass their hover to the art inside them, so hovering the whole card plays it. */
export const HOST_ATTRIBUTE = "data-illustration-host";

const noSubscription = () => () => {};

/** true once hydrated, false on the server: the server renders the finished frame, the client may hide it until in view. */
function useCanObserve() {
  return useSyncExternalStore(
    noSubscription,
    () => typeof IntersectionObserver !== "undefined",
    () => false,
  );
}

/** Replays on a pointer entering the host, or on keyboard focus moving into it from outside. */
function listenForHover(node: Element, replay: () => void) {
  const host = node.closest(`[${HOST_ATTRIBUTE}]`) ?? node;
  const replayOnFocusIn = (event: Event) => {
    const from = (event as FocusEvent).relatedTarget;
    if (!(from instanceof Node && host.contains(from))) replay();
  };
  host.addEventListener("pointerenter", replay);
  host.addEventListener("focusin", replayOnFocusIn);
  return () => {
    host.removeEventListener("pointerenter", replay);
    host.removeEventListener("focusin", replayOnFocusIn);
  };
}

function observeOnce(node: Element, start: () => void) {
  if (typeof IntersectionObserver === "undefined") return undefined;
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry?.isIntersecting) return;
      start();
      observer.disconnect();
    },
    { threshold: 0.35 },
  );
  observer.observe(node);
  return () => observer.disconnect();
}

function replayAfterGap(
  lastRun: { current: number },
  gap: number,
  setRuns: (update: (count: number) => number) => void,
) {
  const now = performance.now();
  if (now - lastRun.current < gap) return;
  lastRun.current = now;
  setRuns((count) => count + 1);
}

/**
 * Counts plays without effects: the observer and the hover listener live in the `observe` ref callback. A hover
 * within `gap` ms of the last play is ignored, so a pointer passing over a run doesn't restart it.
 */
export function usePlayback(trigger: PlayTrigger, gap: number): Playback {
  const [runs, setRuns] = useState(0);
  const lastRun = useRef(-Infinity);
  const canObserve = useCanObserve();

  const observe = useCallback(
    (node: Element | null) => {
      if (!node || trigger === "off") return undefined;
      if (trigger === "hover")
        return listenForHover(node, () =>
          replayAfterGap(lastRun, gap, setRuns),
        );
      return observeOnce(node, () => setRuns((count) => count || 1));
    },
    [trigger, gap],
  );

  return { runs, observe, startsHidden: trigger === "inView" && canObserve };
}
