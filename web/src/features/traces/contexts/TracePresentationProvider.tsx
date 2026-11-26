import { createContext, use, useMemo, type ReactNode } from "react";

/** How an embedder shows the trace: the transcript or one observation's span. */
export type TracePresentation = "messages" | "observation";

type TracePresentationContextValue = {
  /** Null on the standalone trace page. */
  presentation: TracePresentation | null;
  isEmbedded: boolean;
  preferredObservationId: string | null;
  /** Observations a click also picks as the sample; the rest are dimmed. Null keeps the tree read-only. */
  selectableObservationIds: ReadonlySet<string> | null;
  onSelectObservation: ((observationId: string) => void) | null;
};

const TracePresentationContext = createContext<TracePresentationContextValue>({
  presentation: null,
  isEmbedded: false,
  preferredObservationId: null,
  selectableObservationIds: null,
  onSelectObservation: null,
});

/** Set by embedders. Both presentations hide the metrics row; "observation" locks selection unless observations can be picked. */
export function TracePresentationProvider({
  presentation,
  preferredObservationId = null,
  selectableObservationIds = null,
  onSelectObservation = null,
  children,
}: {
  presentation: TracePresentation | null;
  /** Selected while the URL has no observation; the URL wins once set. */
  preferredObservationId?: string | null;
  selectableObservationIds?: ReadonlySet<string> | null;
  onSelectObservation?: ((observationId: string) => void) | null;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({
      presentation,
      isEmbedded: presentation != null,
      preferredObservationId,
      selectableObservationIds,
      onSelectObservation,
    }),
    [
      presentation,
      preferredObservationId,
      selectableObservationIds,
      onSelectObservation,
    ],
  );
  return (
    <TracePresentationContext.Provider value={value}>
      {children}
    </TracePresentationContext.Provider>
  );
}

export function useTracePresentation() {
  return use(TracePresentationContext);
}
