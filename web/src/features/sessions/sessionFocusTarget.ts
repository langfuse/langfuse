import { useEffect, useMemo, useRef } from "react";
import { type Virtualizer } from "@tanstack/react-virtual";
import { StringParam, useQueryParam } from "use-query-params";

/**
 * Cross-product link context (trace -> session). The trace header's session
 * link carries the trace (and selected observation) the user came from, so the
 * session page opens ON that trace instead of at the top.
 *
 * Param names deliberately avoid the trace-peek family (`peek`, `traceId`,
 * `observation`, `timestamp`, `display`): the session page's peek reader
 * treats `traceId` as a v4-dialect peek target and clears `observation` on
 * close, so reusing either would pin or drop the focus.
 */
export const SESSION_FOCUS_TRACE_PARAM = "focusTraceId";
export const SESSION_FOCUS_OBSERVATION_PARAM = "focusObservationId";

/** Marks the focused trace's row shell; rows set it, the pin loop finds it. */
export const SESSION_FOCUSED_TRACE_ATTRIBUTE = "data-session-focused-trace";

export type SessionFocusTarget = {
  traceId: string;
  observationId: string | null;
};

export function buildSessionDetailHref({
  projectId,
  sessionId,
  traceId,
  observationId,
}: {
  projectId: string;
  sessionId: string;
  traceId?: string | null;
  observationId?: string | null;
}) {
  const params = new URLSearchParams();
  if (traceId) {
    params.set(SESSION_FOCUS_TRACE_PARAM, traceId);
    if (observationId) {
      params.set(SESSION_FOCUS_OBSERVATION_PARAM, observationId);
    }
  }
  const search = params.toString();
  return `/project/${projectId}/sessions/${encodeURIComponent(sessionId)}${
    search ? `?${search}` : ""
  }`;
}

/** Reads the focus target from the session page URL (null when absent). */
export function useSessionFocusTarget(): SessionFocusTarget | null {
  const [traceId] = useQueryParam(SESSION_FOCUS_TRACE_PARAM, StringParam);
  const [observationId] = useQueryParam(
    SESSION_FOCUS_OBSERVATION_PARAM,
    StringParam,
  );
  return useMemo(
    () => (traceId ? { traceId, observationId: observationId ?? null } : null),
    [traceId, observationId],
  );
}

// Rows above the target load lazily (skeleton -> content) for a while after
// the jump, each resize shifting the target; a cold load also re-keys every
// row's measurement once the view id lands in the URL. The pin loop re-aligns
// every frame for at least MIN_PIN_MS, then stops once the position has held
// for SETTLE_FRAMES (a requested observation must have rendered), or at
// MAX_PIN_MS regardless.
const SETTLE_FRAMES = 12;
const MIN_PIN_MS = 2500;
const MAX_PIN_MS = 5000;
// wheel/touch/keys and pointerdown (scrollbar drag) mean the user took over.
const USER_SCROLL_EVENTS = [
  "wheel",
  "touchmove",
  "keydown",
  "pointerdown",
] as const;

function pinSessionFocusTarget(
  virtualizer: Virtualizer<HTMLDivElement, Element>,
  index: number,
  focusTarget: SessionFocusTarget,
): () => void {
  const startedAt = performance.now();
  let stableFrames = 0;
  let observationSeen = false;
  let frame = 0;
  let listeningOn: HTMLElement | null = null;

  const stop = () => {
    cancelAnimationFrame(frame);
    USER_SCROLL_EVENTS.forEach((event) =>
      listeningOn?.removeEventListener(event, stop),
    );
    listeningOn = null;
  };

  const tick = () => {
    // The scroll element may attach a frame after the traces arrive.
    const scrollElement =
      virtualizer.scrollElement ?? virtualizer.options.getScrollElement();
    if (scrollElement && listeningOn !== scrollElement) {
      // The user taking over the scroll ends the pin; fighting them is worse
      // than landing slightly off.
      USER_SCROLL_EVENTS.forEach((event) =>
        scrollElement.addEventListener(event, stop, { passive: true }),
      );
      listeningOn = scrollElement;
    }

    if (scrollElement) {
      const observation = focusTarget.observationId
        ? scrollElement.querySelector<HTMLElement>(
            `[data-session-observation-id="${CSS.escape(focusTarget.observationId)}"]`,
          )
        : null;
      // Card / feed rows mark themselves; the conversation timeline's trace
      // sections carry the trace id instead.
      const target =
        observation ??
        scrollElement.querySelector<HTMLElement>(
          `[${SESSION_FOCUSED_TRACE_ATTRIBUTE}="true"], [data-session-trace-id="${CSS.escape(focusTarget.traceId)}"]`,
        );
      if (observation) observationSeen = true;

      if (target) {
        const targetRect = target.getBoundingClientRect();
        const hostRect = scrollElement.getBoundingClientRect();
        // Observation: centered. Trace: its top at the viewport top.
        const inset = observation
          ? Math.max(0, (scrollElement.clientHeight - targetRect.height) / 2)
          : 0;
        const desiredTop =
          scrollElement.scrollTop + targetRect.top - hostRect.top - inset;
        if (Math.abs(desiredTop - scrollElement.scrollTop) > 1) {
          scrollElement.scrollTo({ top: desiredTop, behavior: "instant" });
          stableFrames = 0;
        } else {
          stableFrames += 1;
        }
      } else {
        // Row not mounted yet: jump to its (estimated) offset so the
        // virtualizer renders it. Re-evaluated each frame as rows above get
        // measured.
        const offset = virtualizer.getOffsetForIndex(index, "start")?.[0];
        if (
          offset !== undefined &&
          Math.abs(scrollElement.scrollTop - offset) > 1
        ) {
          scrollElement.scrollTo({ top: offset, behavior: "instant" });
        }
        stableFrames = 0;
      }
    }

    const elapsed = performance.now() - startedAt;
    const settled =
      elapsed >= MIN_PIN_MS &&
      stableFrames >= SETTLE_FRAMES &&
      (!focusTarget.observationId || observationSeen);
    if (settled || elapsed > MAX_PIN_MS) {
      stop();
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  return stop;
}

/**
 * Lands a virtualized trace list on the focused trace (or its observation)
 * once the trace list is in, via the pin loop above. One shot per target so a
 * refetch of the trace list never yanks the user back.
 */
export function useScrollToFocusedSessionTrace({
  enabled = true,
  focusTarget,
  traceIds,
  virtualizer,
}: {
  enabled?: boolean;
  focusTarget: SessionFocusTarget | null;
  traceIds: readonly string[] | undefined;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
}) {
  const appliedKeyRef = useRef<string | null>(null);
  const stopPinRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopPinRef.current?.(), []);

  useEffect(() => {
    if (!enabled || !focusTarget || !traceIds) return;
    const key = `${focusTarget.traceId}:${focusTarget.observationId ?? ""}`;
    if (appliedKeyRef.current === key) return;
    const index = traceIds.indexOf(focusTarget.traceId);
    if (index === -1) return;
    appliedKeyRef.current = key;

    stopPinRef.current?.();
    stopPinRef.current = pinSessionFocusTarget(virtualizer, index, focusTarget);
  }, [enabled, focusTarget, traceIds, virtualizer]);
}
