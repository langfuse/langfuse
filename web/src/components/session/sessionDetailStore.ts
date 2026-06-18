import { createStore, type StoreApi } from "zustand/vanilla";

export type LoadedTraceIds = Record<string, true>;

export interface SessionDetailStoreState {
  loadedTraceIds: LoadedTraceIds;
  showCorrections: boolean;
  sessionId: string;
  actions: {
    markTraceLoaded: (traceId: string) => void;
    setShowCorrections: (showCorrections: boolean) => void;
    resetForSession: (sessionId: string) => void;
  };
}

export type SessionDetailStore = StoreApi<SessionDetailStoreState>;

export function createSessionDetailStore({
  initialSessionId,
  initialShowCorrections,
}: {
  initialSessionId: string;
  initialShowCorrections: boolean;
}): SessionDetailStore {
  return createStore<SessionDetailStoreState>((set, get) => ({
    loadedTraceIds: {},
    showCorrections: initialShowCorrections,
    sessionId: initialSessionId,
    actions: {
      markTraceLoaded: (traceId: string) => {
        if (get().loadedTraceIds[traceId]) return;

        set((state) => ({
          loadedTraceIds: {
            ...state.loadedTraceIds,
            [traceId]: true,
          },
        }));
      },
      setShowCorrections: (showCorrections: boolean) => {
        if (showCorrections === get().showCorrections) return;
        set({ showCorrections });
      },
      resetForSession: (sessionId: string) => {
        if (sessionId === get().sessionId) return;
        set({
          loadedTraceIds: {},
          sessionId,
        });
      },
    },
  }));
}
