/* eslint-disable @repo/component-file-structure */
import { type AnnotationPanelData } from "@/src/features/scores/types";
import { type CommentTarget } from "@/src/features/comments/state/commentOverlayStore";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useTraceData } from "../contexts/TraceDataProvider";
import { useSelection } from "../contexts/SelectionProvider";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { prepareTraceAnnotation } from "@/src/features/scores/lib/prepareTraceAnnotation";
import { useStore } from "zustand";
import { useEffect, useRef, type ReactNode } from "react";
import { useRouter, type NextRouter } from "next/router";
import { X } from "@langfuse/icons";
import { Button } from "@/src/components/ui/button";
import { CommentList } from "@/src/features/comments/CommentList";
import { AnnotationPanelContent } from "@/src/features/scores/components/AnnotationPanelContent";
import { hasBlockingOverlay } from "@/src/features/scores/lib/keyboardShortcuts";
import { useTraceReviewPanel } from "../contexts/TraceReviewPanelProvider";
import {
  isSameCommentObject,
  selectTraceCommentsTarget,
  type TraceReviewPanelStore,
} from "../state/traceReviewPanelStore";
import { traceNodeId } from "../fns/treeBuilding";
import { getSelectedObservation } from "../fns/getSelectedObservation";

function closeReviewPanel(store: TraceReviewPanelStore, router: NextRouter) {
  store.getState().actions.close();
  if (router.query.comments !== "open" && router.query.annotation !== "open")
    return;
  const { comments, commentObjectType, commentObjectId, annotation, ...query } =
    router.query;
  router.replace({ pathname: router.pathname, query }, undefined, {
    shallow: true,
  });
}

function CloseReviewPanelButton() {
  const store = useTraceReviewPanel();
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label="Close side panel"
      onClick={() => closeReviewPanel(store, router)}
    >
      <X size="sm" color="default" />
    </Button>
  );
}

function TraceCommentsPanel({ projectId }: { projectId: string }) {
  const store = useTraceReviewPanel();
  const { query } = useRouter();
  const { trace: anchorTrace, observations, sessionTraces } = useTraceData();
  const { selectedNodeId } = useSelection();
  const trace =
    sessionTraces?.find((entry) => traceNodeId(entry.id) === selectedNodeId) ??
    anchorTrace;
  const session = useStore(store, (state) => state.comments);
  const active = query.comments === "open" && query.annotation !== "open";
  const target = selectTraceCommentsTarget({
    session,
    active,
    trace,
    observations,
    selectedNodeId,
  });
  return (
    <CommentsPanel projectId={projectId} target={target} active={active} />
  );
}

function CommentsPanel({
  projectId,
  target,
  active,
}: {
  projectId: string;
  target: CommentTarget;
  active: boolean;
}) {
  const store = useTraceReviewPanel();
  const onCommentChange = useStore(store, (state) =>
    state.comments && isSameCommentObject(state.comments.target, target)
      ? state.comments.onCommentChange
      : undefined,
  );
  const actions = store.getState().actions;
  return (
    <section
      aria-label="Comments"
      className="flex h-full min-h-0 flex-col"
      hidden={!active}
    >
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
        <h2 className="text-sm font-bold">Comments</h2>
        <CloseReviewPanelButton />
      </div>
      <div className="min-h-0 flex-1">
        <CommentList
          key={`${target.objectType}:${target.objectId}`}
          projectId={projectId}
          objectId={target.objectId}
          objectType={target.objectType}
          objectStartTime={target.objectStartTime}
          pendingSelection={
            target.type === "inline-comment" ? target.selection : null
          }
          onSelectionUsed={() => actions.consumeCommentsSelection(target)}
          onDraftChange={(hasDraft) =>
            actions.setCommentsDraft(target, hasDraft)
          }
          onMentionDropdownChange={(open) =>
            actions.setCommentsMentionsOpen(target, open)
          }
          onCommentChange={onCommentChange}
          isDrawerOpen={active}
          isActive={active}
        />
      </div>
    </section>
  );
}

function TraceAnnotationPanel() {
  const store = useTraceReviewPanel();
  const annotation = useStore(store, (state) => state.annotation);
  const {
    trace: anchorTrace,
    observations,
    serverScores,
    sessionTraces,
  } = useTraceData();
  const { selectedNodeId } = useSelection();
  const trace =
    sessionTraces?.find((entry) => traceNodeId(entry.id) === selectedNodeId) ??
    anchorTrace;
  const { isV4 } = useReadPath();
  const observation = getSelectedObservation(
    observations,
    selectedNodeId,
    trace.id,
  );
  const active = useRouter().query.annotation === "open";
  const explicitTarget = useRef({
    annotation,
    selectedNodeId,
    invalidated: false,
  });
  if (explicitTarget.current.annotation !== annotation) {
    explicitTarget.current = { annotation, selectedNodeId, invalidated: false };
  }
  if (explicitTarget.current.selectedNodeId !== selectedNodeId) {
    explicitTarget.current.invalidated = true;
  }
  if (annotation && !explicitTarget.current.invalidated) {
    return (
      <AnnotationPanel
        key={annotation.key}
        data={annotation.data}
        active={active}
      />
    );
  }
  if (
    selectedNodeId &&
    selectedNodeId !== trace.id &&
    selectedNodeId !== traceNodeId(trace.id) &&
    !observation
  ) {
    return (
      <div className="p-4 text-sm" hidden={!active}>
        Loading annotation…
      </div>
    );
  }
  const data = prepareTraceAnnotation({
    traceId: observation?.traceId ?? trace.id,
    projectId: trace.projectId,
    environment: observation?.environment ?? trace.environment,
    observationId: observation?.id,
    scores: serverScores.filter(
      (score) => score.traceId === (observation?.traceId ?? trace.id),
    ),
    isV4,
  });
  return (
    <AnnotationPanel
      key={observation?.id ?? trace.id}
      data={{
        ...data,
        companionTrace:
          observation && isV4
            ? {
                environment: observation.environment,
                scores: serverScores.filter(
                  (score) =>
                    !score.observationId &&
                    score.traceId === observation.traceId,
                ),
              }
            : undefined,
      }}
      active={active}
    />
  );
}

function AnnotationPanel({
  data,
  active,
}: {
  data: AnnotationPanelData;
  active: boolean;
}) {
  const store = useTraceReviewPanel();
  return (
    <section
      aria-label="Annotate"
      className="h-full overflow-y-auto p-1 [--annotation-surface:var(--background)]"
      hidden={!active}
    >
      <AnnotationPanelContent
        data={data}
        refreshRef={store.annotationFormRef}
        actionButtons={<CloseReviewPanelButton />}
        isActive={active}
      />
    </section>
  );
}

export function TraceReviewPanel({ projectId }: { projectId: string }) {
  const store = useTraceReviewPanel();
  const hasComments = useStore(store, (state) => state.comments !== null);
  const hasAnnotation = useStore(store, (state) => state.annotation !== null);
  const { query } = useRouter();
  const canAnnotate = useHasProjectAccess({ projectId, scope: "scores:save" });
  const annotationOpen = query.annotation === "open" && canAnnotate;
  return (
    <ReviewPanel
      active={
        annotationOpen ? "annotate" : query.comments === "open" && "comments"
      }
    >
      {(hasComments || query.comments === "open") && (
        <TraceCommentsPanel projectId={projectId} />
      )}
      {canAnnotate && (hasAnnotation || annotationOpen) && (
        <TraceAnnotationPanel />
      )}
    </ReviewPanel>
  );
}

export function SessionReviewPanel({ projectId }: { projectId: string }) {
  const store = useTraceReviewPanel();
  const active = useStore(store, (state) => state.active);
  const comments = useStore(store, (state) => state.comments);
  const annotation = useStore(store, (state) => state.annotation);
  const canAnnotate = useHasProjectAccess({ projectId, scope: "scores:save" });
  return (
    <ReviewPanel active={active}>
      {comments && (
        <CommentsPanel
          key={comments.key}
          projectId={projectId}
          target={comments.target}
          active={active === "comments"}
        />
      )}
      {annotation && canAnnotate && (
        <AnnotationPanel
          key={annotation.key}
          data={annotation.data}
          active={active === "annotate"}
        />
      )}
    </ReviewPanel>
  );
}

function ReviewPanel({
  active,
  children,
}: {
  active: "annotate" | "comments" | false | null;
  children: ReactNode;
}) {
  const store = useTraceReviewPanel();
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const root = rootRef.current;
      if (!root || hasBlockingOverlay(root)) return;
      const workspace = root.closest("[data-trace-review-open]");
      if (
        event.target instanceof Node &&
        event.target !== document.body &&
        !workspace?.contains(event.target)
      )
        return;
      if (active === "comments" && store.getState().comments?.mentionsOpen)
        return;
      if (
        active === "annotate" &&
        (event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement)
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeReviewPanel(store, router);
    };
    // Capture before the parent peek's document-level dismissal handler.
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [active, router, store]);

  return (
    <div
      ref={rootRef}
      className="bg-background h-full min-h-0 overflow-hidden"
      data-trace-review-panel
    >
      {children}
    </div>
  );
}
