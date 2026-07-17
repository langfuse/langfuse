import { createStore, type StoreApi } from "zustand/vanilla";

export type LoadedTraceIds = Record<string, true>;

export interface SessionDetailStoreState {
  loadedTraceIds: LoadedTraceIds;
  showCorrections: boolean;
  showInlineToolCalls: boolean;
  sessionId: string;
  actions: {
    markTraceLoaded: (traceId: string) => void;
    setShowCorrections: (showCorrections: boolean) => void;
    setShowInlineToolCalls: (showInlineToolCalls: boolean) => void;
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
    showInlineToolCalls: false,
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
      setShowInlineToolCalls: (showInlineToolCalls: boolean) => {
        if (showInlineToolCalls === get().showInlineToolCalls) return;
        set({ showInlineToolCalls });
      },
      resetForSession: (sessionId: string) => {
        if (sessionId === get().sessionId) return;
        set({
          loadedTraceIds: {},
          showInlineToolCalls: false,
          sessionId,
        });
      },
    },
  }));
}
