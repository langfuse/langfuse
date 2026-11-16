import { createStore } from "zustand/vanilla";
import { type CommentTarget } from "@/src/features/comments/state/commentOverlayStore";
import {
  type AnnotationPanelData,
  type AnnotationRefreshHandle,
} from "@/src/features/scores/types";
import { getSelectedObservation } from "../fns/getSelectedObservation";
import { traceNodeId } from "../fns/treeBuilding";

export type TraceCommentsSession = {
  key: number;
  target: CommentTarget;
  onCommentChange?: () => void | Promise<void>;
  hasDraft: boolean;
  mentionsOpen: boolean;
  /** Node selected when a deep link opened this session. */
  deepLinkNodeId?: string | null;
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
    setCommentsDraft: (target: CommentTarget, hasDraft: boolean) => void;
    setCommentsMentionsOpen: (target: CommentTarget, open: boolean) => void;
    consumeCommentsSelection: (target: CommentTarget) => void;
  };
};

type TraceCommentsContext = {
  trace: { id: string; timestamp: Date };
  observations: { id: string; startTime: Date; traceId?: string }[];
  selectedNodeId: string | null;
};

export function isSameCommentObject(a: CommentTarget, b: CommentTarget) {
  return a.objectId === b.objectId && a.objectType === b.objectType;
}

function getSelectedCommentsTarget({
  trace,
  observations,
  selectedNodeId,
}: TraceCommentsContext): CommentTarget {
  const observation = getSelectedObservation(
    observations,
    selectedNodeId,
    trace.id,
  );
  if (observation)
    return {
      type: "comments",
      objectId: observation.id,
      objectType: "OBSERVATION",
      objectStartTime: observation.startTime,
    };
  if (
    !selectedNodeId ||
    selectedNodeId === trace.id ||
    selectedNodeId === traceNodeId(trace.id)
  )
    return {
      type: "comments",
      objectId: trace.id,
      objectType: "TRACE",
      objectStartTime: trace.timestamp,
    };
  // Selected past the loaded list; the detail view fetches it by id.
  return {
    type: "comments",
    objectId: selectedNodeId,
    objectType: "OBSERVATION",
  };
}

/** Keeps a URL comment target only when it belongs to this trace. */
export function getTraceCommentsDeepLink({
  target,
  trace,
  observations,
  selectedNodeId,
}: TraceCommentsContext & { target: CommentTarget | undefined }) {
  if (target?.objectType === "TRACE")
    return target.objectId === trace.id ? target : undefined;
  if (target?.objectType !== "OBSERVATION") return undefined;
  return target.objectId === selectedNodeId ||
    observations.some((item) => item.id === target.objectId)
    ? target
    : undefined;
}

/**
 * The thread the trace panel shows. A hidden panel, an unsent draft, a session
 * on the selected object, or a deep link still on its node keeps the session's
 * target; otherwise the panel follows the selected node.
 */
export function selectTraceCommentsTarget({
  session,
  active,
  ...context
}: TraceCommentsContext & {
  session: TraceCommentsSession | null;
  active: boolean;
}): CommentTarget {
  const selected = getSelectedCommentsTarget(context);
  if (!session) return selected;
  const held =
    !active ||
    session.hasDraft ||
    session.deepLinkNodeId === context.selectedNodeId ||
    isSameCommentObject(session.target, selected);
  return held ? session.target : selected;
}

export function createTraceReviewPanelStore({
  projectId,
  initialComments,
  deepLinkNodeId,
}: {
  projectId: string;
  initialComments?: CommentTarget;
  deepLinkNodeId?: string | null;
}) {
  let commentsKey = 0;
  const annotationFormRef: { current: AnnotationRefreshHandle | null } = {
    current: null,
  };
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
  const updateComments = (
    current: TraceCommentsSession | null,
    target: CommentTarget,
    field: "hasDraft" | "mentionsOpen",
    value: boolean,
  ): TraceCommentsSession | null => {
    if (current && isSameCommentObject(current.target, target))
      return current[field] === value ? null : { ...current, [field]: value };
    // Input in a followed thread starts its session unless another thread
    // holds a draft.
    return value && !current?.hasDraft
      ? { ...createCommentsSession(target), [field]: value }
      : null;
  };

  const store = createStore<TraceReviewPanelState>((set, get) => ({
    active: initialComments ? "comments" : null,
    comments: initialComments
      ? { ...createCommentsSession(initialComments), deepLinkNodeId }
      : null,
    annotation: null,
    actions: {
      openComments({ target, onCommentChange, confirmDiscard }) {
        const current = get().comments;
        if (current && isSameCommentObject(current.target, target)) {
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
        if (current?.key === key) {
          annotationFormRef.current?.refresh(data);
          if (get().active === "annotate") annotationFormRef.current?.focus();
        }
        set({
          active: "annotate",
          annotation: { key, data },
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
      setCommentsDraft(target, hasDraft) {
        const comments = updateComments(
          get().comments,
          target,
          "hasDraft",
          hasDraft,
        );
        if (comments) set({ comments });
      },
      setCommentsMentionsOpen(target, open) {
        const comments = updateComments(
          get().comments,
          target,
          "mentionsOpen",
          open,
        );
        if (comments) set({ comments });
      },
      consumeCommentsSelection(target) {
        const current = get().comments;
        if (
          !current ||
          !isSameCommentObject(current.target, target) ||
          current.target.type !== "inline-comment"
        )
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
  return Object.assign(store, { annotationFormRef });
}

export type TraceReviewPanelStore = ReturnType<
  typeof createTraceReviewPanelStore
>;
