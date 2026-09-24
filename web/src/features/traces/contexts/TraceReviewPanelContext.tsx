import { createContext, useContext, useState, type ReactNode } from "react";
import { type CommentTarget } from "@/src/features/comments/state/commentOverlayStore";
import {
  createTraceReviewPanelStore,
  type TraceReviewPanelStore,
} from "../state/traceReviewPanelStore";

const TraceReviewPanelContext = createContext<TraceReviewPanelStore | null>(
  null,
);

export function TraceReviewPanelProvider({
  projectId,
  initialComments,
  children,
}: {
  projectId: string;
  initialComments?: CommentTarget;
  children: ReactNode;
}) {
  const [store] = useState(() =>
    createTraceReviewPanelStore({ projectId, initialComments }),
  );

  return (
    <TraceReviewPanelContext.Provider value={store}>
      {children}
    </TraceReviewPanelContext.Provider>
  );
}

export function useTraceReviewPanelOptional() {
  return useContext(TraceReviewPanelContext);
}

export function useTraceReviewPanel() {
  const store = useTraceReviewPanelOptional();
  if (!store)
    throw new Error(
      "useTraceReviewPanel must be used within a TraceReviewPanelProvider",
    );
  return store;
}
