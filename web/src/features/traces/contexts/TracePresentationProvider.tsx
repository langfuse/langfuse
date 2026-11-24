import { createContext, use, type ReactNode } from "react";

/**
 * How an embedded trace is shown. "messages" is the transcript.
 * "observation" is the span preview with its metadata collapsed.
 * Null on the standalone trace page.
 */
export type TracePresentation = "messages" | "observation";

const TracePresentationContext = createContext<TracePresentation | null>(null);

export function TracePresentationProvider({
  presentation,
  children,
}: {
  presentation: TracePresentation | null;
  children: ReactNode;
}) {
  return (
    <TracePresentationContext.Provider value={presentation}>
      {children}
    </TracePresentationContext.Provider>
  );
}

export function useTracePresentation() {
  return use(TracePresentationContext);
}

export function useIsEmbeddedTrace(): boolean {
  return useTracePresentation() != null;
}
