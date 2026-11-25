import { createContext, use, useMemo, type ReactNode } from "react";

/** How an embedder shows the trace: the transcript or one observation's span. */
export type TracePresentation = "messages" | "observation";

type TracePresentationContextValue = {
  /** Null on the standalone trace page. */
  presentation: TracePresentation | null;
  isEmbedded: boolean;
  preferredObservationId: string | null;
};

const TracePresentationContext = createContext<TracePresentationContextValue>({
  presentation: null,
  isEmbedded: false,
  preferredObservationId: null,
});

/** Set by embedders. Both presentations hide the metrics row; "observation" also locks selection. */
export function TracePresentationProvider({
  presentation,
  preferredObservationId = null,
  children,
}: {
  presentation: TracePresentation | null;
  /** Selected while the URL has no observation; the URL wins once set. */
  preferredObservationId?: string | null;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({
      presentation,
      isEmbedded: presentation != null,
      preferredObservationId,
    }),
    [presentation, preferredObservationId],
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
