/**
 * PlayheadContext - provides the per-mount trace playback store.
 *
 * The engine itself (state, actions, RAF loop) lives in playheadStore.ts as a
 * vanilla Zustand store; this file is only the integration boundary:
 * - creates one store instance per mounted trace view (lazy useState),
 * - syncs trace-derived inputs (duration, activation windows) into the store
 *   via a named action whenever the trace or its geometry changes,
 * - exposes narrow hooks so each consumer re-renders only for its slice.
 *
 * The ~60fps playhead position is consumed imperatively via subscribePosition
 * (store.subscribe → write the DOM directly); only discrete flags and the
 * boundary-crossing active Set go through React.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useStore } from "zustand";
import { useTraceData } from "./TraceDataContext";
import {
  buildNodeWindows,
  createPlayheadStore,
  type PlayheadStore,
} from "./playheadStore";

const PlayheadStoreContext = createContext<PlayheadStore | null>(null);

export function PlayheadProvider({ children }: { children: ReactNode }) {
  const { trace, roots, traceStartTime, traceDuration } = useTraceData();

  const nodeWindows = useMemo(
    () => buildNodeWindows(roots, traceStartTime),
    [roots, traceStartTime],
  );

  // One engine instance per mounted trace view, seeded synchronously so the
  // first render already sees the real duration (no "controls flash in" frame).
  const [store] = useState(() => {
    const created = createPlayheadStore();
    created.getState().actions.syncTrace({
      traceDuration,
      nodeWindows,
      hard: true,
    });
    return created;
  });

  // Integration boundary: push geometry changes into the store. A different
  // trace id is a hard reset (playback cleared); same-trace churn (level
  // filter, refetch) is a soft sync that re-clamps and keeps playing.
  const syncedTraceIdRef = useRef(trace.id);
  const firstSyncRef = useRef(true);
  useEffect(() => {
    if (firstSyncRef.current) {
      // The lazy initializer above already synced this exact geometry.
      firstSyncRef.current = false;
      return;
    }
    const hard = syncedTraceIdRef.current !== trace.id;
    syncedTraceIdRef.current = trace.id;
    store.getState().actions.syncTrace({ traceDuration, nodeWindows, hard });
  }, [store, trace.id, traceDuration, nodeWindows]);

  // Halt the RAF loop when the trace view unmounts.
  useEffect(() => () => store.getState().actions.pause(), [store]);

  return (
    <PlayheadStoreContext.Provider value={store}>
      {children}
    </PlayheadStoreContext.Provider>
  );
}

export function usePlayheadStore(): PlayheadStore {
  const store = useContext(PlayheadStoreContext);
  if (!store) {
    throw new Error("usePlayheadStore must be used within a PlayheadProvider");
  }
  return store;
}

/**
 * Transport surface: stable actions plus the imperative position feed for
 * ~60fps consumers (the progress ring, the timeline playhead line/handle).
 */
export function usePlayhead() {
  const store = usePlayheadStore();
  return useMemo(
    () => ({
      ...store.getState().actions,
      getPlayheadSec: () => store.getState().playheadSec,
      /** High-frequency position updates — write the DOM, don't setState. */
      subscribePosition: (listener: (sec: number) => void) =>
        store.subscribe((state, prev) => {
          if (state.playheadSec !== prev.playheadSec) {
            listener(state.playheadSec);
          }
        }),
    }),
    [store],
  );
}

/** Whether playback is currently running (re-renders only on play/pause). */
export function useIsPlaying(): boolean {
  return useStore(usePlayheadStore(), (s) => s.isPlaying);
}

/** Whether a playhead has been placed (re-renders only when it toggles). */
export function useShowPlayhead(): boolean {
  return useStore(usePlayheadStore(), (s) => s.showPlayhead);
}

/**
 * The set of observation ids "playing" at the playhead. Re-renders on
 * boundary crossings only. Drives the timeline row glow and (mapped to node
 * names) the graph glow, so both stay in sync.
 */
export function useActiveObservationIds(): ReadonlySet<string> {
  return useStore(usePlayheadStore(), (s) => s.activeIds);
}

/**
 * Per-row glow subscription: re-renders ONLY the row whose membership flipped
 * (a primitive selector), so a boundary crossing never re-renders the whole
 * virtualized list.
 */
export function useIsObservationActive(id: string): boolean {
  return useStore(usePlayheadStore(), (s) => s.activeIds.has(id));
}
