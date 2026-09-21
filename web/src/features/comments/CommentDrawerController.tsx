import { useRouter } from "next/router";
import { useState, type ReactNode } from "react";
import { type CommentObjectType } from "@langfuse/shared";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";
import { useTraceReviewPanelOptional } from "@/src/features/traces/contexts/TraceReviewPanelContext";
import {
  createCommentOverlayStore,
  type CommentTarget,
} from "./state/commentOverlayStore";
import {
  CommentOverlayHost,
  CommentOverlayState,
} from "./components/CommentOverlayHost";

export type CommentDrawerControllerProps = {
  projectId: string;
  // Evaluated only on mount; use for deep-linked comments, not reactive drawer state.
  initialState?: () => CommentTarget | undefined;
  mode?: "read-write" | "read-only";
  count?: number;
  onCommentChange?: () => void | Promise<void>;
  children: (control: {
    disabled: boolean;
    openDrawer: (state: CommentTarget) => void;
  }) => ReactNode;
};

export function getCommentDrawerInitialStateFromUrl(
  query: Record<string, string | string[] | undefined>,
) {
  const objectId = query.commentObjectId;
  const objectType = query.commentObjectType;
  if (
    query.comments !== "open" ||
    typeof objectId !== "string" ||
    typeof objectType !== "string"
  ) {
    return;
  }

  return {
    type: "comments" as const,
    objectId,
    objectType: objectType as CommentObjectType,
  };
}

export function CommentDrawerController({
  children,
  projectId,
  initialState,
  mode = "read-write",
  count,
  onCommentChange,
}: CommentDrawerControllerProps) {
  const router = useRouter();
  const reviewPanel = useTraceReviewPanelOptional();
  const [store] = useState(createCommentOverlayStore);
  const utils = api.useUtils();
  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "comments:read",
  });
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "comments:CUD",
  });
  const disabled =
    !hasReadAccess || (mode === "read-write" && !hasWriteAccess && !count);

  return (
    <>
      {children({
        disabled,
        openDrawer: (target) => {
          if (disabled) return;
          if (reviewPanel) {
            const actions = reviewPanel.getState().actions;
            actions.rememberTrigger(
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null,
            );
            actions.openComments({
              target,
              onCommentChange,
              confirmDiscard: () =>
                window.confirm("Discard your unsent comment?"),
            });
            return;
          }
          store.getState().actions.open({
            target,
            canWrite: hasWriteAccess,
            confirmDiscard: () =>
              window.confirm("Discard your unsent comment?"),
            loadComments: () =>
              utils.comments.getByObjectId.fetch({
                projectId,
                objectId: target.objectId,
                objectType: target.objectType,
              }),
          });
        },
      })}
      {!reviewPanel && router.isReady && hasReadAccess ? (
        <CommentOverlayState store={store} initialState={initialState}>
          {(overlay) => (
            <CommentOverlayHost
              store={store}
              overlay={overlay}
              projectId={projectId}
              onCommentChange={onCommentChange}
            />
          )}
        </CommentOverlayState>
      ) : null}
    </>
  );
}
