"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";

/** What plays a run: inView once when it scrolls into view, hover on each pointer entry; keyboard focus only lifts. */
export type PlayTrigger = "inView" | "hover" | "off";

export type Playback = {
  /** 0 until the trigger first fires, then +1 per play; groups keyed on it replay their CSS animations. */
  runs: number;
  /** The first run builds from a hidden frame, so values wait at their start until it plays. */
  startsHidden: boolean;
  /** A real pointer is over the host, or keyboard focus is in it: the hero lifts and idle motion runs. */
  isHostActive: boolean;
  /** Ref callback for the art: starts the observer or the hover and focus listeners. */
  observe: (node: Element | null) => (() => void) | undefined;
};

/** Ancestors with this attribute pass their hover and focus to the art inside them, so the whole card plays it. */
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

/**
 * Replays on a mouse or pen entering the host; a touch that starts a tap or a scroll doesn't. Keyboard focus doesn't
 * replay either: tabbing through a row of cards would rebuild each one; it lifts the hero instead (trackActivity).
 */
function listenForHover(host: Element, replay: () => void) {
  const onPointerEnter = (event: Event) => {
    if ((event as PointerEvent).pointerType !== "touch") replay();
  };
  host.addEventListener("pointerenter", onPointerEnter);
  return () => host.removeEventListener("pointerenter", onPointerEnter);
}

/** Reports a mouse or pen over the host, or keyboard focus inside it; a tap or a click's focus doesn't count. */
function trackActivity(host: Element, setActive: (isActive: boolean) => void) {
  let isHovered = false;
  let isFocused = false;
  const report = () => setActive(isHovered || isFocused);
  const onPointerEnter = (event: Event) => {
    if ((event as PointerEvent).pointerType === "touch") return;
    isHovered = true;
    report();
  };
  const onPointerLeave = () => {
    isHovered = false;
    report();
  };
  const onFocusIn = ({ target }: Event) => {
    isFocused = target instanceof Element && target.matches(":focus-visible");
    report();
  };
  const onFocusOut = (event: Event) => {
    const { relatedTarget: to } = event as FocusEvent;
    if (to instanceof Node && host.contains(to)) return;
    isFocused = false;
    report();
  };
  host.addEventListener("pointerenter", onPointerEnter);
  host.addEventListener("pointerleave", onPointerLeave);
  host.addEventListener("focusin", onFocusIn);
  host.addEventListener("focusout", onFocusOut);
  return () => {
    host.removeEventListener("pointerenter", onPointerEnter);
    host.removeEventListener("pointerleave", onPointerLeave);
    host.removeEventListener("focusin", onFocusIn);
    host.removeEventListener("focusout", onFocusOut);
    setActive(false);
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

/**
 * Counts plays and tracks the host's hover and focus without effects: the observer and the listeners live in the
 * `observe` ref callback. A hover within `gap` ms of the last play is ignored, so a pointer passing over a run
 * doesn't restart it.
 */
export function usePlayback(trigger: PlayTrigger, gap: number): Playback {
  const [runs, setRuns] = useState(0);
  const [isHostActive, setIsHostActive] = useState(false);
  const lastRun = useRef(-Infinity);
  const canObserve = useCanObserve();

  const observe = useCallback(
    (node: Element | null) => {
      if (!node || trigger === "off") return undefined;
      const host = node.closest(`[${HOST_ATTRIBUTE}]`) ?? node;
      const stopTracking = trackActivity(host, setIsHostActive);
      const replay = () => {
        const now = performance.now();
        if (now - lastRun.current < gap) return;
        lastRun.current = now;
        setRuns((count) => count + 1);
      };
      const stopPlaying =
        trigger === "hover"
          ? listenForHover(host, replay)
          : observeOnce(node, () => setRuns((count) => count || 1));
      return () => {
        stopTracking();
        stopPlaying?.();
      };
    },
    [trigger, gap],
  );

  return {
    runs,
    isHostActive,
    observe,
    startsHidden: trigger === "inView" && canObserve,
  };
}
