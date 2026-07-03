/**
 * playheadStore - the trace playback engine as a per-mount vanilla Zustand store.
 *
 * One store instance per mounted trace view (created by PlayheadProvider with a
 * lazy useState, per the frontend-large-feature-architecture skill). All
 * playback state lives here; all mutations are named store actions. The RAF
 * loop is owned by the store closure and reads live state via get() each tick,
 * so a trace/data change mid-playback can never leave a stale rate or duration
 * running.
 *
 * Consumption model (re-render discipline):
 * - Discrete flags (isPlaying, showPlayhead) and the active-observation Set are
 *   read via `useStore(store, selector)` — subscribers re-render only when
 *   their slice changes (the active Set changes on boundary crossings, a
 *   handful of times per second, never per frame).
 * - The ~60fps playhead position is consumed imperatively: subscribe to the
 *   store and write the DOM directly (see subscribePosition in
 *   PlayheadContext). playheadSec IS in store state, but nothing subscribes to
 *   it through React.
 */

import { createStore, type StoreApi } from "zustand/vanilla";
import { type TreeNode } from "../lib/types";

/** Activation window of one observation, in seconds from the timeline origin. */
export type NodeWindow = { id: string; startSec: number; endSec: number };

export const EMPTY_ACTIVE_IDS: ReadonlySet<string> = new Set();

// Playback compresses to at most this many wall-clock seconds: traces shorter
// than this play in real time; anything longer scales so the whole trace always
// plays in exactly this window (no manual speed control).
export const PLAYBACK_MAX_SECONDS = 10;
// RAF suspends in hidden tabs; cap the resumed delta so playback sweeps
// instead of teleporting to the end after a background-tab or GC stall.
const MAX_FRAME_SECONDS = 0.25;
// End-of-trace epsilon: at/after this close to the end, "play" restarts from 0.
const END_EPSILON_SECONDS = 0.05;
// Every observation glows for at least this many WALL-CLOCK seconds during
// playback, however short it is in trace time (windows are padded by this
// span × the playback rate).
const MIN_GLOW_WALL_SECONDS = 0.2;

export interface PlayheadState {
  /** Total trace span in seconds (0 = no timeline to play). */
  traceDuration: number;
  /** Padded activation windows for every node in the tree. */
  nodeWindows: NodeWindow[];
  /** Playhead time in seconds from the timeline origin. Updated ~60fps during
   * playback — consume imperatively (store.subscribe), not via useStore. */
  playheadSec: number;
  isPlaying: boolean;
  showPlayhead: boolean;
  /** Observations "playing" at the playhead — drives the timeline/graph glow. */
  activeIds: ReadonlySet<string>;
  actions: {
    play: () => void;
    pause: () => void;
    /** Clear the playhead entirely (position, glow, visibility). */
    stop: () => void;
    /** Move the playhead to an absolute time (seconds from origin) and pause. */
    seekToSec: (sec: number) => void;
    /**
     * Integration seam: sync trace-derived inputs into the store.
     * `hard` (a different trace loaded) also resets playback; a soft sync
     * (same trace, roots churn — level filter, refetch) re-clamps the playhead
     * against the new geometry and keeps playback running.
     */
    syncTrace: (input: {
      traceDuration: number;
      nodeWindows: NodeWindow[];
      hard: boolean;
    }) => void;
  };
}

export type PlayheadStore = StoreApi<PlayheadState>;

/** Playback rate in trace-seconds per wall-clock second. */
export function playbackRate(traceDuration: number): number {
  return traceDuration > PLAYBACK_MAX_SECONDS
    ? traceDuration / PLAYBACK_MAX_SECONDS
    : 1;
}

/**
 * Flatten the trace tree into activation windows (seconds from origin).
 * The synthetic TRACE wrapper (v3 traces) gets no window: it isn't an
 * observation, and its zero-width window (endTime null) would otherwise be
 * padded into a brief bogus glow of the trace-name row at playback start.
 * Iterative to avoid stack overflow on deep trees. Pure — unit-testable.
 */
export function buildNodeWindows(
  roots: TreeNode[],
  traceStartTime: Date,
): NodeWindow[] {
  const originMs = traceStartTime.getTime();
  const out: NodeWindow[] = [];
  const stack: TreeNode[] = [...roots];
  while (stack.length > 0) {
    const node = stack.pop()!;
    for (const child of node.children) stack.push(child);
    if (node.type === "TRACE") continue;
    const startSec = (node.startTime.getTime() - originMs) / 1000;
    const endSec =
      ((node.endTime ?? node.startTime).getTime() - originMs) / 1000;
    out.push({ id: node.id, startSec, endSec });
  }
  return out;
}

/**
 * Pad windows so every observation stays active for at least
 * MIN_GLOW_WALL_SECONDS of wall-clock playback — otherwise zero/short-duration
 * observations (events, fast tool calls) would never light up: the playhead
 * samples at frame granularity and playback compresses long traces, so a 5ms
 * span inside a compressed 10s sweep is far narrower than one frame.
 * Activation-only: rendered bar geometry does NOT use these windows. Pure.
 */
export function padActivationWindows(
  windows: NodeWindow[],
  traceDuration: number,
): NodeWindow[] {
  const minSpanSec = MIN_GLOW_WALL_SECONDS * playbackRate(traceDuration);
  return windows.map((w) =>
    w.endSec - w.startSec >= minSpanSec
      ? w
      : { ...w, endSec: w.startSec + minSpanSec },
  );
}

/**
 * The ids active anywhere in the swept interval [lo, hi]. Sweep semantics (not
 * point sampling) so a dropped/throttled frame cannot skip over a short
 * observation without it ever glowing. Pure.
 */
export function computeActiveIds(
  windows: NodeWindow[],
  lo: number,
  hi: number,
): Set<string> {
  const next = new Set<string>();
  for (const w of windows) {
    if (w.startSec <= hi && w.endSec >= lo) next.add(w.id);
  }
  return next;
}

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of b) if (!a.has(id)) return false;
  return true;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function createPlayheadStore(): PlayheadStore {
  // RAF handle + frame clock are per-instance (a trace peek and the full trace
  // page can mount two providers) — they live in this closure, not module scope.
  let raf: number | null = null;
  let lastTs = 0;

  return createStore<PlayheadState>()((set, get) => {
    const cancelRaf = () => {
      if (raf != null) cancelAnimationFrame(raf);
      raf = null;
    };

    // Move the playhead across [prevSec, sec]: clamp, recompute the active set
    // over the swept interval, and commit the Set only when it changed (a
    // boundary crossing) so React subscribers don't wake every frame.
    const positionPlayhead = (sec: number, prevSec = sec) => {
      const { traceDuration, nodeWindows, activeIds } = get();
      const clamped = clamp(sec, 0, traceDuration);
      const lo = Math.min(clamped, clamp(prevSec, 0, traceDuration));
      const next = computeActiveIds(nodeWindows, lo, clamped);
      if (setsEqual(activeIds, next)) {
        set({ playheadSec: clamped });
      } else {
        set({ playheadSec: clamped, activeIds: next });
      }
    };

    const pause = () => {
      cancelRaf();
      set({ isPlaying: false });
    };

    return {
      traceDuration: 0,
      nodeWindows: [],
      playheadSec: 0,
      isPlaying: false,
      showPlayhead: false,
      activeIds: EMPTY_ACTIVE_IDS,
      actions: {
        play: () => {
          if (get().traceDuration <= 0) return;
          cancelRaf();
          set({ showPlayhead: true, isPlaying: true });
          // Restart from the beginning if the playhead is at (or past) the end.
          if (get().playheadSec >= get().traceDuration - END_EPSILON_SECONDS) {
            positionPlayhead(0);
          }
          lastTs = 0;
          const step = (ts: number) => {
            if (!lastTs) lastTs = ts;
            const dt = Math.min((ts - lastTs) / 1000, MAX_FRAME_SECONDS);
            lastTs = ts;
            // Live reads each tick — duration/rate stay correct across
            // same-trace data changes mid-playback.
            const { traceDuration, playheadSec } = get();
            const nextSec = playheadSec + dt * playbackRate(traceDuration);
            if (nextSec >= traceDuration) {
              positionPlayhead(traceDuration, playheadSec);
              pause();
              return;
            }
            positionPlayhead(nextSec, playheadSec);
            raf = requestAnimationFrame(step);
          };
          raf = requestAnimationFrame(step);
        },
        pause,
        stop: () => {
          cancelRaf();
          set({
            playheadSec: 0,
            isPlaying: false,
            showPlayhead: false,
            activeIds: EMPTY_ACTIVE_IDS,
          });
        },
        seekToSec: (sec) => {
          cancelRaf();
          set({ isPlaying: false, showPlayhead: true });
          positionPlayhead(sec);
        },
        syncTrace: ({ traceDuration, nodeWindows, hard }) => {
          const padded = padActivationWindows(nodeWindows, traceDuration);
          if (hard) {
            // A different trace loaded — reset playback entirely.
            cancelRaf();
            set({
              traceDuration,
              nodeWindows: padded,
              playheadSec: 0,
              isPlaying: false,
              showPlayhead: false,
              activeIds: EMPTY_ACTIVE_IDS,
            });
            return;
          }
          // Same trace, new geometry (level filter, refetch): re-clamp the
          // playhead and recompute the glow; playback (live-reading get())
          // continues seamlessly at the new rate.
          set({ traceDuration, nodeWindows: padded });
          if (get().showPlayhead) positionPlayhead(get().playheadSec);
        },
      },
    };
  });
}
