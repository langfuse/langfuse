import { createContext, useContext, useState, type ReactNode } from "react";
import { type CommentTarget } from "@/src/features/comments/state/commentOverlayStore";
import {
  createTraceReviewPanelStore,
  type TraceReviewPanelStore,
} from "../state/traceReviewPanelStore";

const ReviewPanelOpenContext = createContext<
  | ((panel: "annotation" | "comments", target?: CommentTarget) => void)
  | undefined
>(undefined);

export function useReviewPanelOpen() {
  return useContext(ReviewPanelOpenContext);
}

const TraceReviewPanelContext = createContext<TraceReviewPanelStore | null>(
  null,
);

export function TraceReviewPanelProvider({
  projectId,
  initialComments,
  onOpen,
  children,
}: {
  projectId: string;
  initialComments?: CommentTarget;
  onOpen?: (panel: "annotation" | "comments", target?: CommentTarget) => void;
  children: ReactNode;
}) {
  const [store] = useState(() =>
    createTraceReviewPanelStore({
      projectId,
      initialComments,
    }),
  );

  return (
    <TraceReviewPanelContext.Provider value={store}>
      <ReviewPanelOpenContext.Provider value={onOpen}>
        {children}
      </ReviewPanelOpenContext.Provider>
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
