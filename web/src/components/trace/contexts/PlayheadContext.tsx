/**
 * PlayheadContext - shares the timeline playhead's "active" observation set with
 * sibling views (the graph), so scrubbing/playing lights up the same run across
 * the timeline and the graph.
 *
 * Backed by a tiny external store (not React state) so writing the active set
 * (a few times/sec, on playhead boundary crossings) re-renders only the
 * subscribing views — not the whole trace body.
 */

import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

const EMPTY_IDS: ReadonlySet<string> = new Set();
const NOOP_SUBSCRIBE = () => () => {};
const NOOP_SET = (_ids: ReadonlySet<string>) => {};

interface PlayheadStore {
  getActiveIds: () => ReadonlySet<string>;
  setActiveIds: (ids: ReadonlySet<string>) => void;
  subscribe: (listener: () => void) => () => void;
}

function createPlayheadStore(): PlayheadStore {
  let active: ReadonlySet<string> = EMPTY_IDS;
  const listeners = new Set<() => void>();
  return {
    getActiveIds: () => active,
    setActiveIds: (ids) => {
      if (ids === active) return;
      active = ids;
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const PlayheadContext = createContext<PlayheadStore | null>(null);

export function PlayheadProvider({ children }: { children: ReactNode }) {
  // Per-mount store, created lazily (never on the server render).
  const [store] = useState(createPlayheadStore);
  return (
    <PlayheadContext.Provider value={store}>
      {children}
    </PlayheadContext.Provider>
  );
}

/** Subscribe to the set of observation ids "playing" at the playhead time. */
export function useActiveObservationIds(): ReadonlySet<string> {
  const store = useContext(PlayheadContext);
  return useSyncExternalStore(
    store?.subscribe ?? NOOP_SUBSCRIBE,
    store?.getActiveIds ?? (() => EMPTY_IDS),
    () => EMPTY_IDS,
  );
}

/** Setter for the active-observation set (used by the timeline playhead). */
export function useSetActiveObservationIds(): (
  ids: ReadonlySet<string>,
) => void {
  const store = useContext(PlayheadContext);
  return store?.setActiveIds ?? NOOP_SET;
}
