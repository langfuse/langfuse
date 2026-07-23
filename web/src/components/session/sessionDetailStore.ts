import { createStore, type StoreApi } from "zustand/vanilla";

export type LoadedTraceIds = Record<string, true>;

/**
 * Identifies what the Modern Session inspector panel shows: an observation,
 * or (observationId null) the trace/turn itself.
 */
export interface InspectedObservation {
  traceId: string;
  observationId: string | null;
}

/** Which generations render per conversation turn (ex LLM-call presets). */
export type GenerationView = "all" | "first" | "last";

export interface SessionDetailStoreState {
  loadedTraceIds: LoadedTraceIds;
  showCorrections: boolean;
  showInlineToolCalls: boolean;
  showSystemPrompt: boolean;
  inspectedObservation: InspectedObservation | null;
  generationView: GenerationView;
  sessionId: string;
  actions: {
    markTraceLoaded: (traceId: string) => void;
    setShowCorrections: (showCorrections: boolean) => void;
    setShowInlineToolCalls: (showInlineToolCalls: boolean) => void;
    setShowSystemPrompt: (showSystemPrompt: boolean) => void;
    openInspector: (inspectedObservation: InspectedObservation) => void;
    closeInspector: () => void;
    setGenerationView: (generationView: GenerationView) => void;
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
    generationView: "all",
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
      setGenerationView: (generationView: GenerationView) => {
        if (generationView === get().generationView) return;
        set({ generationView });
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
