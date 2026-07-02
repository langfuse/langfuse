/**
 * PlayheadContext - the trace playback engine, shared across every trace view.
 *
 * Owns a single "playhead" that sweeps the trace's timeline and drives:
 *  - the transport controls (play/pause/stop), rendered view-agnostically in the
 *    navigation header so they show in Tree AND Timeline views;
 *  - a circular time-progress ring (fills as the playhead advances);
 *  - the Timeline's vertical playhead line + handle;
 *  - the "active run" glow across the timeline rows and the graph nodes.
 *
 * Re-render discipline (see frontend-large-feature-architecture):
 *  - Position moves ~60fps during playback → an imperative pub/sub
 *    (subscribePosition); subscribers write the DOM directly, no React re-render.
 *  - The active-observation Set changes only on boundary crossings → its own
 *    store; only the timeline rows + graph (its subscribers) re-render.
 *  - Transport flags (isPlaying/showPlayhead) change only on discrete actions →
 *    a third store with primitive selector hooks, so the provider value stays
 *    stable and the whole trace body never re-renders during playback.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useTraceData } from "./TraceDataContext";
import {
  calculateTraceDuration,
  findEarliestStartTime,
} from "../components/TraceTimeline/timeline-calculations";
import { type TreeNode } from "../lib/types";

// Playback compresses to at most this many wall-clock seconds: traces shorter
// than this play in real time; anything longer scales so the whole trace always
// plays in exactly this window (no manual speed control).
const PLAYBACK_MAX_SECONDS = 10;
// End-of-trace epsilon: at/after this close to the end, "play" restarts from 0.
const END_EPSILON_SECONDS = 0.05;

const EMPTY_IDS: ReadonlySet<string> = new Set();
const NOOP_SUBSCRIBE = () => () => {};

type NodeWindow = { id: string; startSec: number; endSec: number };
type Transport = { isPlaying: boolean; showPlayhead: boolean };

interface PlayheadContextValue {
  /** true when the trace has a positive duration (a timeline to play). */
  hasTimeline: boolean;
  /** Total trace span in seconds (timeline origin → latest end). */
  traceDuration: number;
  /** Timeline origin (the 0s mark). */
  traceStartTime: Date;
  play: () => void;
  pause: () => void;
  stop: () => void;
  /** Move the playhead to an absolute time (seconds from origin) and pause. */
  seekToSec: (sec: number) => void;
  /** Current playhead time in seconds (read on demand; not reactive). */
  getPlayheadSec: () => number;
  /** High-frequency position updates (imperative — write the DOM, don't setState). */
  subscribePosition: (listener: (sec: number) => void) => () => void;
  // active-observation Set store (glow) — updated only on boundary crossings.
  getActiveIds: () => ReadonlySet<string>;
  subscribeActive: (listener: () => void) => () => void;
  // transport store — read via the primitive selector hooks below.
  getTransport: () => Transport;
  subscribeTransport: (listener: () => void) => () => void;
}

const PlayheadContext = createContext<PlayheadContextValue | null>(null);

export function PlayheadProvider({ children }: { children: ReactNode }) {
  const { roots } = useTraceData();

  const traceStartTime = useMemo(
    () => findEarliestStartTime(roots) ?? new Date(),
    [roots],
  );
  const traceDuration = useMemo(
    () => calculateTraceDuration(roots, traceStartTime),
    [roots, traceStartTime],
  );

  // Active window (start/end sec from origin) for EVERY node in the tree — the
  // full tree, not just uncollapsed timeline rows, so the timeline glow and the
  // graph glow stay consistent regardless of collapse state.
  const nodeWindows = useMemo<NodeWindow[]>(() => {
    const originMs = traceStartTime.getTime();
    const out: NodeWindow[] = [];
    const stack: TreeNode[] = [...roots];
    while (stack.length > 0) {
      const node = stack.pop()!;
      const startSec = (node.startTime.getTime() - originMs) / 1000;
      const endSec =
        ((node.endTime ?? node.startTime).getTime() - originMs) / 1000;
      out.push({ id: node.id, startSec, endSec });
      for (const child of node.children) stack.push(child);
    }
    return out;
  }, [roots, traceStartTime]);
  const nodeWindowsRef = useRef(nodeWindows);
  nodeWindowsRef.current = nodeWindows;

  const playheadSecRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);

  // --- position pub/sub (imperative, ~60fps) ---
  const positionListeners = useRef(new Set<(sec: number) => void>());
  const subscribePosition = useCallback((listener: (sec: number) => void) => {
    positionListeners.current.add(listener);
    return () => {
      positionListeners.current.delete(listener);
    };
  }, []);
  const getPlayheadSec = useCallback(() => playheadSecRef.current, []);
  const notifyPosition = useCallback((sec: number) => {
    positionListeners.current.forEach((l) => l(sec));
  }, []);

  // --- active-observation Set store (re-renders subscribers on boundary crossings) ---
  const activeIdsRef = useRef<ReadonlySet<string>>(EMPTY_IDS);
  const activeListeners = useRef(new Set<() => void>());
  const subscribeActive = useCallback((listener: () => void) => {
    activeListeners.current.add(listener);
    return () => {
      activeListeners.current.delete(listener);
    };
  }, []);
  const getActiveIds = useCallback(() => activeIdsRef.current, []);
  const setActiveIds = useCallback((ids: ReadonlySet<string>) => {
    if (ids === activeIdsRef.current) return;
    activeIdsRef.current = ids;
    activeListeners.current.forEach((l) => l());
  }, []);

  // --- transport store (isPlaying / showPlayhead; discrete changes only) ---
  const transportRef = useRef<Transport>({
    isPlaying: false,
    showPlayhead: false,
  });
  const transportListeners = useRef(new Set<() => void>());
  const subscribeTransport = useCallback((listener: () => void) => {
    transportListeners.current.add(listener);
    return () => {
      transportListeners.current.delete(listener);
    };
  }, []);
  const getTransport = useCallback(() => transportRef.current, []);
  const setTransport = useCallback((patch: Partial<Transport>) => {
    const cur = transportRef.current;
    const next = { ...cur, ...patch };
    if (
      next.isPlaying === cur.isPlaying &&
      next.showPlayhead === cur.showPlayhead
    )
      return;
    transportRef.current = next;
    transportListeners.current.forEach((l) => l());
  }, []);

  // Move the playhead: write the position (imperative), then recompute the
  // active set and commit only when it changes (a boundary crossing).
  const positionPlayhead = useCallback(
    (sec: number) => {
      const clamped = Math.max(0, Math.min(traceDuration, sec));
      playheadSecRef.current = clamped;
      notifyPosition(clamped);

      const next = new Set<string>();
      for (const w of nodeWindowsRef.current) {
        if (clamped >= w.startSec && clamped <= w.endSec) next.add(w.id);
      }
      const cur = activeIdsRef.current;
      let changed = cur.size !== next.size;
      if (!changed) {
        for (const id of next) {
          if (!cur.has(id)) {
            changed = true;
            break;
          }
        }
      }
      if (changed) setActiveIds(next);
    },
    [traceDuration, notifyPosition, setActiveIds],
  );

  const pause = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setTransport({ isPlaying: false });
  }, [setTransport]);

  const seekToSec = useCallback(
    (sec: number) => {
      pause();
      setTransport({ showPlayhead: true });
      positionPlayhead(sec);
    },
    [pause, setTransport, positionPlayhead],
  );

  const play = useCallback(() => {
    if (traceDuration <= 0) return;
    setTransport({ showPlayhead: true, isPlaying: true });
    // Restart from the beginning if the playhead is at (or past) the end.
    if (playheadSecRef.current >= traceDuration - END_EPSILON_SECONDS) {
      positionPlayhead(0);
    }
    lastTsRef.current = 0;
    // Rate = trace-seconds per wall-clock-second. Short traces play in real time
    // (rate 1); long ones scale so the whole trace finishes in
    // PLAYBACK_MAX_SECONDS regardless of its true length.
    const rate =
      traceDuration > PLAYBACK_MAX_SECONDS
        ? traceDuration / PLAYBACK_MAX_SECONDS
        : 1;
    const startSec = playheadSecRef.current;
    const step = (ts: number) => {
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      const nextSec = playheadSecRef.current + dt * rate;
      if (nextSec >= traceDuration) {
        positionPlayhead(traceDuration);
        pause();
        return;
      }
      positionPlayhead(nextSec);
      rafRef.current = requestAnimationFrame(step);
    };
    // Seed the position so a paused-at-start play doesn't skip the first frame.
    positionPlayhead(startSec);
    rafRef.current = requestAnimationFrame(step);
  }, [traceDuration, positionPlayhead, pause, setTransport]);

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    playheadSecRef.current = 0;
    notifyPosition(0);
    setActiveIds(EMPTY_IDS);
    setTransport({ isPlaying: false, showPlayhead: false });
  }, [notifyPosition, setActiveIds, setTransport]);

  // Reset when the trace changes (new roots → new duration/windows) and on
  // unmount — cancel any in-flight animation and clear the playhead.
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  useEffect(() => {
    // A different trace loaded — reset the playhead to the start.
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    playheadSecRef.current = 0;
    notifyPosition(0);
    setActiveIds(EMPTY_IDS);
    setTransport({ isPlaying: false, showPlayhead: false });
  }, [roots, notifyPosition, setActiveIds, setTransport]);

  const value = useMemo<PlayheadContextValue>(
    () => ({
      hasTimeline: traceDuration > 0,
      traceDuration,
      traceStartTime,
      play,
      pause,
      stop,
      seekToSec,
      getPlayheadSec,
      subscribePosition,
      getActiveIds,
      subscribeActive,
      getTransport,
      subscribeTransport,
    }),
    [
      traceDuration,
      traceStartTime,
      play,
      pause,
      stop,
      seekToSec,
      getPlayheadSec,
      subscribePosition,
      getActiveIds,
      subscribeActive,
      getTransport,
      subscribeTransport,
    ],
  );

  return (
    <PlayheadContext.Provider value={value}>
      {children}
    </PlayheadContext.Provider>
  );
}

export function usePlayhead(): PlayheadContextValue {
  const ctx = useContext(PlayheadContext);
  if (!ctx) {
    throw new Error("usePlayhead must be used within a PlayheadProvider");
  }
  return ctx;
}

/** Whether playback is currently running (re-renders only on play/pause). */
export function useIsPlaying(): boolean {
  const ctx = useContext(PlayheadContext);
  return useSyncExternalStore(
    ctx?.subscribeTransport ?? NOOP_SUBSCRIBE,
    ctx ? () => ctx.getTransport().isPlaying : () => false,
    () => false,
  );
}

/** Whether a playhead has been placed (re-renders only when it toggles). */
export function useShowPlayhead(): boolean {
  const ctx = useContext(PlayheadContext);
  return useSyncExternalStore(
    ctx?.subscribeTransport ?? NOOP_SUBSCRIBE,
    ctx ? () => ctx.getTransport().showPlayhead : () => false,
    () => false,
  );
}

/**
 * The set of observation ids "playing" at the playhead. Subscribes to the
 * active-set store — re-renders on boundary crossings only. Used by the timeline
 * rows and (mapped to node names) the graph, so both glow in sync.
 */
export function useActiveObservationIds(): ReadonlySet<string> {
  const ctx = useContext(PlayheadContext);
  return useSyncExternalStore(
    ctx?.subscribeActive ?? NOOP_SUBSCRIBE,
    ctx?.getActiveIds ?? (() => EMPTY_IDS),
    () => EMPTY_IDS,
  );
}
