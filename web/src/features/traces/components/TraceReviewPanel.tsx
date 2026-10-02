import { type CommentTarget } from "@/src/features/comments/state/commentOverlayStore";
import { getCommentDrawerInitialStateFromUrl } from "@/src/features/comments/CommentDrawerController";
import { useHasProjectAccess } from "@/src/features/rbac";
import { useTraceData } from "../contexts/TraceDataContext";
import { useSelection } from "../contexts/SelectionContext";
import { useReadPath } from "@/src/features/events";
import { prepareTraceAnnotation } from "@/src/features/scores/lib/prepareTraceAnnotation";
import { useStore } from "zustand";
import { useEffect, useRef } from "react";
import { useRouter, type NextRouter } from "next/router";
import { X } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { CommentList } from "@/src/features/comments/CommentList";
import { AnnotationPanelContent } from "@/src/features/scores/components/AnnotationPanelContent";
import { hasBlockingOverlay } from "@/src/features/scores/lib/keyboardShortcuts";
import { useTraceReviewPanel } from "../contexts/TraceReviewPanelContext";
import { type TraceReviewPanelStore } from "../state/traceReviewPanelStore";

function closeReviewPanel(store: TraceReviewPanelStore, router: NextRouter) {
  store.getState().actions.close();
  if (router.query.comments !== "open" && !router.query.mode) return;
  const { comments, commentObjectType, commentObjectId, mode, ...query } =
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
      <X className="size-4" />
    </Button>
  );
}

function TraceCommentsPanel({ projectId }: { projectId: string }) {
  const store = useTraceReviewPanel();
  const router = useRouter();
  const { trace, observations } = useTraceData();
  const { selectedNodeId } = useSelection();
  const observation = observations.find((item) => item.id === selectedNodeId);
  const session = useStore(store, (state) => state.comments);
  const active =
    router.query.mode === "comment" || router.query.comments === "open";
  const target: CommentTarget = (!active ? session?.target : undefined) ??
    getCommentDrawerInitialStateFromUrl(router.query) ?? {
      type: "comments" as const,
      objectId: observation?.id ?? trace.id,
      objectType: observation ? ("OBSERVATION" as const) : ("TRACE" as const),
      objectStartTime: observation?.startTime ?? trace.timestamp,
    };
  const matchingSession =
    session?.target.objectId === target.objectId &&
    session.target.objectType === target.objectType
      ? session
      : null;
  const sessionKey = matchingSession?.key ?? -1;
  const onCommentChange = matchingSession?.onCommentChange;
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
          objectStartTime={
            matchingSession?.target.objectStartTime ?? target.objectStartTime
          }
          pendingSelection={
            matchingSession?.target.type === "inline-comment"
              ? matchingSession.target.selection
              : null
          }
          onSelectionUsed={() => actions.consumeCommentsSelection(sessionKey)}
          onDraftChange={(hasDraft) =>
            actions.setCommentsDraft(sessionKey, hasDraft)
          }
          onMentionDropdownChange={(open) =>
            actions.setCommentsMentionsOpen(sessionKey, open)
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
  const { trace, observations, serverScores } = useTraceData();
  const { selectedNodeId } = useSelection();
  const { isV4 } = useReadPath();
  const observation = observations.find((item) => item.id === selectedNodeId);
  const active = useRouter().query.mode === "annotate";
  if (selectedNodeId && selectedNodeId !== trace.id && !observation) {
    return (
      <div className="p-4 text-sm" hidden={!active}>
        Loading annotation…
      </div>
    );
  }
  const data = prepareTraceAnnotation({
    traceId: trace.id,
    projectId: trace.projectId,
    environment: observation?.environment ?? trace.environment,
    observationId: observation?.id,
    scores: serverScores,
    isV4,
  });
  return (
    <section
      aria-label="Annotate"
      className="h-full overflow-y-auto p-1 [--annotation-surface:var(--background)]"
      hidden={!active}
    >
      <AnnotationPanelContent
        key={observation?.id ?? trace.id}
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
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const query = router.query;
  const active =
    query.mode ?? (query.comments === "open" ? "comment" : undefined);
  const commentsKey = useStore(store, (state) => state.comments?.key);
  const annotationKey = useStore(store, (state) => state.annotation?.key);
  const canAnnotate = useHasProjectAccess({ projectId, scope: "scores:CUD" });

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
      if (active === "comment" && store.getState().comments?.mentionsOpen)
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
      {commentsKey !== undefined ||
      active === "comment" ||
      router.query.comments === "open" ? (
        <TraceCommentsPanel key={commentsKey} projectId={projectId} />
      ) : null}
      {canAnnotate && (annotationKey !== undefined || active === "annotate") ? (
        <TraceAnnotationPanel />
      ) : null}
    </div>
  );
}
