import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";

type ReadPathToggleState = {
  /** The read path a toggle is currently committing; null when idle. */
  pendingReadPath: ResolvedReadPath | null;
  actions: {
    begin: (target: ResolvedReadPath) => void;
    settle: () => void;
  };
};

// Global on purpose: the post-toggle redirect remounts the toggle surfaces,
// and the in-flight intent must survive that remount.
export const readPathToggleStore = createStore<ReadPathToggleState>()(
  (set) => ({
    pendingReadPath: null,
    actions: {
      begin: (target) => set({ pendingReadPath: target }),
      settle: () => set({ pendingReadPath: null }),
    },
  }),
);

export const usePendingReadPath = (): ResolvedReadPath | null =>
  useStore(readPathToggleStore, (state) => state.pendingReadPath);
