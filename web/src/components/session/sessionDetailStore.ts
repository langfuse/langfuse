import { createStore, type StoreApi } from "zustand/vanilla";

export type LoadedTraceIds = Record<string, true>;

/** Identifies the observation shown in the Modern Session inspector panel. */
export interface InspectedObservation {
  traceId: string;
  observationId: string;
}

export interface SessionDetailStoreState {
  loadedTraceIds: LoadedTraceIds;
  showCorrections: boolean;
  showInlineToolCalls: boolean;
  showSystemPrompt: boolean;
  inspectedObservation: InspectedObservation | null;
  sessionId: string;
  actions: {
    markTraceLoaded: (traceId: string) => void;
    setShowCorrections: (showCorrections: boolean) => void;
    setShowInlineToolCalls: (showInlineToolCalls: boolean) => void;
    setShowSystemPrompt: (showSystemPrompt: boolean) => void;
    openInspector: (inspectedObservation: InspectedObservation) => void;
    closeInspector: () => void;
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
    showSystemPrompt: false,
    inspectedObservation: null,
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
      setShowSystemPrompt: (showSystemPrompt: boolean) => {
        if (showSystemPrompt === get().showSystemPrompt) return;
        set({ showSystemPrompt });
      },
      openInspector: (inspectedObservation: InspectedObservation) => {
        set({ inspectedObservation });
      },
      closeInspector: () => {
        if (get().inspectedObservation === null) return;
        set({ inspectedObservation: null });
      },
      resetForSession: (sessionId: string) => {
        if (sessionId === get().sessionId) return;
        set({
          loadedTraceIds: {},
          showInlineToolCalls: false,
          showSystemPrompt: false,
          inspectedObservation: null,
          sessionId,
        });
      },
    },
  }));
}
