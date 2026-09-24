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
  if (router.query.comments !== "open") return;
  const { comments, commentObjectType, commentObjectId, ...query } =
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
  const target = useStore(store, (state) => state.comments!.target);
  const sessionKey = useStore(store, (state) => state.comments!.key);
  const onCommentChange = useStore(
    store,
    (state) => state.comments!.onCommentChange,
  );
  const active = useStore(store, (state) => state.active === "comments");
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
          projectId={projectId}
          objectId={target.objectId}
          objectType={target.objectType}
          objectStartTime={target.objectStartTime}
          pendingSelection={
            target.type === "inline-comment" ? target.selection : null
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
  const annotation = useStore(store, (state) => state.annotation!);
  const active = useStore(store, (state) => state.active === "annotate");
  return (
    <section
      aria-label="Annotate"
      className="h-full overflow-y-auto p-1 [--annotation-surface:var(--background)]"
      hidden={!active}
    >
      <AnnotationPanelContent
        data={annotation.data}
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
  const active = useStore(store, (state) => state.active);
  const commentsKey = useStore(store, (state) => state.comments?.key);
  const annotationKey = useStore(store, (state) => state.annotation?.key);
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
      {commentsKey !== undefined ? (
        <TraceCommentsPanel key={commentsKey} projectId={projectId} />
      ) : null}
      {annotationKey !== undefined ? (
        <TraceAnnotationPanel key={annotationKey} />
      ) : null}
    </div>
  );
}
