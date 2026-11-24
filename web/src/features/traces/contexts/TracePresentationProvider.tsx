import { createContext, use, useMemo, type ReactNode } from "react";

/**
 * How an embedded trace is shown. "messages" is the transcript.
 * "observation" is the span preview of one observation.
 * Null on the standalone trace page.
 */
export type TracePresentation = "messages" | "observation";

type TracePresentationContextValue = {
  presentation: TracePresentation | null;
  isEmbedded: boolean;
};

const TracePresentationContext = createContext<TracePresentationContextValue>({
  presentation: null,
  isEmbedded: false,
});

export function TracePresentationProvider({
  presentation,
  children,
}: {
  presentation: TracePresentation | null;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ presentation, isEmbedded: presentation != null }),
    [presentation],
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
