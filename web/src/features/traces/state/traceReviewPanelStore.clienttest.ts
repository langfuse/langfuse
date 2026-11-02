import { type CommentTarget } from "@/src/features/comments/state/commentOverlayStore";
import { type AnnotationPanelData } from "@/src/features/scores/types";
import { createTraceReviewPanelStore } from "./traceReviewPanelStore";

const target: CommentTarget = {
  type: "comments",
  objectId: "trace",
  objectType: "TRACE",
};
const selection = {
  dataField: "output" as const,
  path: ["$"],
  rangeStart: [0],
  rangeEnd: [4],
  selectedText: "text",
  anchorRect: null,
};
const annotation: AnnotationPanelData = {
  scoreTarget: { type: "trace", traceId: "trace", observationId: "span" },
  scoreMetadata: { projectId: "project" },
  analyticsData: { type: "trace", source: "TraceDetail", isV4: true },
  scores: [],
  companionTrace: { environment: "default", scores: [] },
};

describe("trace review panel sessions", () => {
  it("keeps a comment draft and its session when closed and reopened", () => {
    const store = createTraceReviewPanelStore({ projectId: "project" });
    const actions = store.getState().actions;
    const confirmDiscard = vi.fn(() => false);
    actions.openComments({ target, confirmDiscard });
    const key = store.getState().comments!.key;
    actions.setCommentsDraft(key, true);
    actions.close();
    expect(store.getState().active).toBeNull();
    expect(store.getState().comments?.hasDraft).toBe(true);

    actions.openComments({ target: { ...target }, confirmDiscard });
    expect(store.getState().active).toBe("comments");
    expect(store.getState().comments).toMatchObject({ key, hasDraft: true });
    expect(confirmDiscard).not.toHaveBeenCalled();
  });

  it("preserves both sessions while switching modes and refreshing score data", () => {
    const store = createTraceReviewPanelStore({
      projectId: "project",
      initialComments: target,
    });
    const actions = store.getState().actions;
    const commentsKey = store.getState().comments!.key;
    actions.setCommentsDraft(commentsKey, true);
    actions.openAnnotation(annotation);
    const annotationSession = store.getState().annotation;
    const refresh = vi.fn();
    const focus = vi.fn();
    store.annotationFormRef.current = { refresh, focus };
    actions.openComments({ target, confirmDiscard: () => false });
    const refreshed = { ...annotation, scores: [] };
    actions.openAnnotation(refreshed);

    expect(store.getState().active).toBe("annotate");
    expect(store.getState().comments).toMatchObject({
      key: commentsKey,
      hasDraft: true,
    });
    expect(store.getState().annotation?.key).toBe(annotationSession?.key);
    expect(store.getState().annotation?.data).toBe(refreshed);
    expect(refresh).toHaveBeenCalledExactlyOnceWith(refreshed);
    expect(focus).not.toHaveBeenCalled();
    actions.openAnnotation(refreshed);
    expect(focus).toHaveBeenCalledOnce();
  });

  it("returns focus to a connected trigger on close and ignores a removed trigger", () => {
    const store = createTraceReviewPanelStore({ projectId: "project" });
    const actions = store.getState().actions;
    const trigger = document.createElement("button");
    const focus = vi.spyOn(trigger, "focus");
    document.body.appendChild(trigger);
    try {
      actions.rememberTrigger(trigger);
      actions.openComments({ target, confirmDiscard: () => true });
      actions.close();
      expect(focus).toHaveBeenCalledWith({ preventScroll: true });
      focus.mockClear();
      trigger.remove();
      actions.openComments({ target, confirmDiscard: () => true });
      actions.close();
      expect(focus).not.toHaveBeenCalled();
    } finally {
      trigger.remove();
    }
  });

  it("asks before replacing another target's unsent comment, even when hidden", () => {
    const store = createTraceReviewPanelStore({
      projectId: "project",
      initialComments: target,
    });
    const actions = store.getState().actions;
    const key = store.getState().comments!.key;
    actions.setCommentsDraft(key, true);
    actions.setCommentsMentionsOpen(key, true);
    actions.openAnnotation(annotation);
    const before = store.getState();
    const nextTarget: CommentTarget = {
      ...target,
      objectId: "span",
      objectType: "OBSERVATION",
    };
    const confirmDiscard = vi.fn(() => false);
    actions.openComments({ target: nextTarget, confirmDiscard });
    expect(store.getState()).toBe(before);
    expect(confirmDiscard).toHaveBeenCalledOnce();

    actions.openComments({ target: nextTarget, confirmDiscard: () => true });
    expect(store.getState().active).toBe("comments");
    expect(store.getState().comments).toMatchObject({
      target: nextTarget,
      hasDraft: false,
      mentionsOpen: false,
    });
    expect(store.getState().comments?.key).not.toBe(key);
  });

  it("ignores old session callbacks and consumes a hidden selection without reopening", () => {
    const store = createTraceReviewPanelStore({
      projectId: "project",
      initialComments: target,
    });
    const actions = store.getState().actions;
    const oldKey = store.getState().comments!.key;
    actions.openComments({
      target: {
        ...target,
        objectId: "other",
        type: "inline-comment",
        selection,
      },
      confirmDiscard: () => true,
    });
    const key = store.getState().comments!.key;
    actions.setCommentsDraft(key, true);
    const before = store.getState();
    actions.setCommentsDraft(oldKey, false);
    actions.setCommentsMentionsOpen(oldKey, true);
    actions.consumeCommentsSelection(oldKey);
    expect(store.getState()).toBe(before);

    actions.close();
    actions.setCommentsDraft(key, false);
    actions.consumeCommentsSelection(key);
    expect(store.getState().active).toBeNull();
    expect(store.getState().comments).toMatchObject({
      key,
      target: { type: "comments", objectId: "other" },
      hasDraft: false,
    });
    expect(store.getState().comments?.target).not.toHaveProperty("selection");
  });

  it("keeps an unsent inline selection on same-target reopen and accepts new selections once consumed", () => {
    const store = createTraceReviewPanelStore({
      projectId: "project",
      initialComments: { ...target, type: "inline-comment", selection },
    });
    const actions = store.getState().actions;
    const key = store.getState().comments!.key;
    actions.setCommentsDraft(key, true);
    const nextSelection = { ...selection, selectedText: "next" };
    const nextTarget: CommentTarget = {
      ...target,
      type: "inline-comment",
      selection: nextSelection,
    };
    actions.openComments({ target: nextTarget, confirmDiscard: () => false });
    expect(store.getState().comments?.target).toMatchObject({ selection });
    actions.setCommentsDraft(key, false);
    actions.consumeCommentsSelection(key);
    actions.openComments({ target: nextTarget, confirmDiscard: () => true });
    expect(store.getState().comments).toMatchObject({
      key,
      target: { selection: nextSelection },
    });
  });
});
