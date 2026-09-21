import { createStore } from "zustand/vanilla";
import { type CommentTarget } from "@/src/features/comments/state/commentOverlayStore";
import { type AnnotationPanelData } from "@/src/features/scores/types";

export type TraceCommentsSession = {
  key: number;
  target: CommentTarget;
  onCommentChange?: () => void | Promise<void>;
  hasDraft: boolean;
  mentionsOpen: boolean;
};

type TraceAnnotationSession = {
  key: string;
  data: AnnotationPanelData;
};

type TraceReviewPanelState = {
  active: "comments" | "annotate" | null;
  comments: TraceCommentsSession | null;
  annotation: TraceAnnotationSession | null;
  actions: {
    openComments: (input: {
      target: CommentTarget;
      onCommentChange?: () => void | Promise<void>;
      confirmDiscard: () => boolean;
    }) => void;
    openAnnotation: (data: AnnotationPanelData) => void;
    rememberTrigger: (element: HTMLElement | null) => void;
    close: () => void;
    setCommentsDraft: (key: number, hasDraft: boolean) => void;
    setCommentsMentionsOpen: (key: number, open: boolean) => void;
    consumeCommentsSelection: (key: number) => void;
  };
};

export function createTraceReviewPanelStore({
  projectId,
  initialComments,
}: {
  projectId: string;
  initialComments?: CommentTarget;
}) {
  let commentsKey = 0;
  let trigger: HTMLElement | null = null;
  const createCommentsSession = (
    target: CommentTarget,
    onCommentChange?: TraceCommentsSession["onCommentChange"],
  ): TraceCommentsSession => ({
    key: ++commentsKey,
    target,
    onCommentChange,
    hasDraft: false,
    mentionsOpen: false,
  });

  return createStore<TraceReviewPanelState>((set, get) => ({
    active: initialComments ? "comments" : null,
    comments: initialComments ? createCommentsSession(initialComments) : null,
    annotation: null,
    actions: {
      openComments({ target, onCommentChange, confirmDiscard }) {
        const current = get().comments;
        const sameTarget =
          current?.target.objectId === target.objectId &&
          current.target.objectType === target.objectType;
        if (sameTarget) {
          // Reopening an object keeps its composer and any unsent selection.
          const nextTarget =
            !current.hasDraft && target.type === "inline-comment"
              ? target
              : current.target;
          set({
            active: "comments",
            comments:
              current.target === nextTarget &&
              current.onCommentChange === onCommentChange
                ? current
                : { ...current, target: nextTarget, onCommentChange },
          });
          return;
        }
        if (current?.hasDraft && !confirmDiscard()) return;
        set({
          active: "comments",
          comments: createCommentsSession(target, onCommentChange),
        });
      },
      openAnnotation(data) {
        const target = data.scoreTarget;
        const key = JSON.stringify([
          projectId,
          target.type,
          target.type === "trace" ? target.traceId : target.sessionId,
          target.type === "trace" ? (target.observationId ?? null) : null,
          data.scoreMetadata.queueId ?? null,
          Boolean(data.companionTrace),
        ]);
        const current = get().annotation;
        set({
          active: "annotate",
          annotation: current?.key === key ? current : { key, data },
        });
      },
      rememberTrigger(element) {
        trigger = element;
      },
      close() {
        if (get().active === null) return;
        set({ active: null });
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      },
      setCommentsDraft(key, hasDraft) {
        const current = get().comments;
        if (current?.key !== key || current.hasDraft === hasDraft) return;
        set({ comments: { ...current, hasDraft } });
      },
      setCommentsMentionsOpen(key, mentionsOpen) {
        const current = get().comments;
        if (current?.key !== key || current.mentionsOpen === mentionsOpen)
          return;
        set({ comments: { ...current, mentionsOpen } });
      },
      consumeCommentsSelection(key) {
        const current = get().comments;
        if (current?.key !== key || current.target.type !== "inline-comment")
          return;
        const { objectId, objectType, objectStartTime } = current.target;
        set({
          comments: {
            ...current,
            target: { type: "comments", objectId, objectType, objectStartTime },
          },
        });
      },
    },
  }));
}

export type TraceReviewPanelStore = ReturnType<
  typeof createTraceReviewPanelStore
>;
