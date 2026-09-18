/* eslint-disable @repo/no-null-render */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Badge } from "@/src/components/ui/badge";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";
import { getRelativeTimestampFromNow } from "@/src/utils/dates";
import { cn } from "@/src/utils/tailwind";
import { type CommentObjectType } from "@langfuse/shared";
import { Search, Trash, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { ReactionPicker } from "./ReactionPicker";
import { ReactionBar } from "./ReactionBar";
import { CommentCard } from "./components/CommentCard";
import { CommentComposer } from "./components/CommentComposer";
import { stripMarkdown } from "@/src/utils/markdown";
import { type SelectionData } from "./contexts/InlineCommentSelectionContext";

type CommentListProps = {
  projectId: string;
  objectId: string;
  objectType: CommentObjectType;
  objectStartTime?: Date | null;
  cardView?: boolean;
  onDraftChange?: (hasDraft: boolean) => void;
  onMentionDropdownChange?: (isOpen: boolean) => void;
  isDrawerOpen?: boolean;
  pendingSelection?: SelectionData | null;
  onSelectionUsed?: () => void;
  onCommentChange?: () => void | Promise<void>;
};

function humanizeJsonPath(path: string): string {
  if (path === "$") return "(root)";
  return path
    .replace(/^\$\.?/, "")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean)
    .join(" › ");
}

export function CommentList(props: CommentListProps) {
  return (
    <CommentThread
      key={`${props.projectId}-${props.objectType}-${props.objectId}`}
      {...props}
    />
  );
}

function CommentThread({
  projectId,
  objectId,
  objectType,
  objectStartTime,
  cardView = false,
  onDraftChange,
  onMentionDropdownChange,
  isDrawerOpen = false,
  pendingSelection,
  onSelectionUsed,
  onCommentChange,
}: CommentListProps) {
  const session = useSession();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const commentsContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const didInitialAutoscrollRef = useRef(false);
  const hash = router.asPath.split("#")[1];
  const highlightedCommentId = hash?.startsWith("comment-")
    ? hash.slice("comment-".length)
    : null;
  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "comments:read",
  });
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "comments:CUD",
  });
  const comments = api.comments.getByObjectId.useQuery(
    { projectId, objectId, objectType },
    { enabled: hasReadAccess && session.status === "authenticated" },
  );
  const utils = api.useUtils();
  async function invalidateCommentQueries() {
    Promise.resolve()
      .then(() => onCommentChange?.())
      .catch(() => undefined);
    await utils.comments.invalidate();
  }
  const deleteComment = api.comments.delete.useMutation({
    onSuccess: invalidateCommentQueries,
  });
  const addReaction = api.commentReactions.add.useMutation({
    onSuccess: () => utils.commentReactions.invalidate(),
  });
  const removeReaction = api.commentReactions.remove.useMutation({
    onSuccess: () => utils.commentReactions.invalidate(),
  });

  // Keep the DOM scroll position on the linked comment or the latest conversation.
  useEffect(() => {
    const container = commentsContainerRef.current;
    if (!comments.data || !container) return;
    const frame = requestAnimationFrame(() => {
      if (highlightedCommentId) {
        document
          .getElementById(`comment-${highlightedCommentId}`)
          ?.scrollIntoView({ block: "center" });
      } else if (!didInitialAutoscrollRef.current) {
        container.scrollTop = container.scrollHeight;
        didInitialAutoscrollRef.current = true;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [comments.data, highlightedCommentId]);

  useEffect(() => {
    if (!isDrawerOpen) return;
    function focusSearch(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, [contenteditable=true]")
      )
        return;
      if ((event.metaKey || event.ctrlKey) && event.key === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", focusSearch, { capture: true });
    return () =>
      window.removeEventListener("keydown", focusSearch, { capture: true });
  }, [isDrawerOpen]);

  if (!hasReadAccess || session.status !== "authenticated") return null;
  if (comments.isPending)
    return (
      <div className="flex justify-center p-6">
        <Spinner size="sm" /> <span className="sr-only">Loading comments</span>
      </div>
    );
  if (comments.isError && comments.data === undefined)
    return (
      <div className="flex flex-col items-start gap-3 p-4">
        <p className="text-muted-foreground text-sm">
          Comments could not be loaded.
        </p>
        <Button variant="outline" size="sm" onClick={() => comments.refetch()}>
          Try again
        </Button>
      </div>
    );

  const sortedComments = [...comments.data].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const query = searchQuery.trim().toLowerCase();
  const filteredComments = sortedComments.filter(
    (comment) =>
      !query ||
      stripMarkdown(comment.content).toLowerCase().includes(query) ||
      (comment.authorUserName ?? comment.authorUserId ?? "")
        .toLowerCase()
        .includes(query),
  );

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden",
        cardView && "rounded-md border",
      )}
    >
      {cardView && (
        <h3 className="shrink-0 border-b px-4 py-3 text-sm font-bold">
          Comments
        </h3>
      )}
      {comments.data.length > 0 && (
        <div className="flex shrink-0 flex-col gap-2 border-b px-4 py-3">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              ref={searchInputRef}
              aria-label="Search comments"
              placeholder="Search comments…"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-9 pr-9 pl-9"
            />
            {searchQuery && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                title="Clear search"
                className="absolute top-1/2 right-2 -translate-y-1/2"
                onClick={() => setSearchQuery("")}
              >
                <X className="size-3" />
              </Button>
            )}
          </div>
          <p className="text-muted-foreground text-xs" aria-live="polite">
            {query
              ? `${filteredComments.length} of ${comments.data.length} comments`
              : `${comments.data.length} comment${comments.data.length === 1 ? "" : "s"}`}
          </p>
        </div>
      )}
      <div
        ref={commentsContainerRef}
        className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
      >
        {filteredComments.length === 0 && (
          <p className="text-muted-foreground px-2 py-6 text-sm">
            {query ? "No comments match your search." : "No comments yet."}
          </p>
        )}
        <div className="divide-y">
          {filteredComments.map((comment) => (
            <CommentCard
              key={comment.id}
              id={comment.id}
              authorName={
                comment.authorUserName ?? comment.authorUserId ?? "User"
              }
              authorImage={comment.authorUserImage}
              timestamp={getRelativeTimestampFromNow(comment.createdAt)}
              content={comment.content}
              highlighted={highlightedCommentId === comment.id}
              location={
                comment.dataField && comment.path.length > 0 ? (
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {comment.dataField.toUpperCase()}
                    </Badge>
                    <span className="truncate" title={comment.path[0]}>
                      {humanizeJsonPath(comment.path[0])}
                    </span>
                  </div>
                ) : null
              }
              actions={
                hasWriteAccess &&
                session.data?.user?.id === comment.authorUserId ? (
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    title="Delete comment"
                    loading={deleteComment.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Are you sure you want to delete this comment?",
                        )
                      )
                        deleteComment.mutate({
                          commentId: comment.id,
                          projectId,
                          objectId,
                          objectType,
                        });
                    }}
                  >
                    <Trash className="size-3.5" />
                  </Button>
                ) : null
              }
              footer={
                <>
                  <ReactionBar
                    projectId={projectId}
                    commentId={comment.id}
                    onReactionToggle={(emoji, hasReacted) => {
                      if (!hasWriteAccess) return;
                      const input = { projectId, commentId: comment.id, emoji };
                      if (hasReacted) removeReaction.mutate(input);
                      else addReaction.mutate(input);
                    }}
                  />
                  {hasWriteAccess && (
                    <ReactionPicker
                      onEmojiSelect={(emoji) =>
                        addReaction.mutate({
                          projectId,
                          commentId: comment.id,
                          emoji,
                        })
                      }
                    />
                  )}
                </>
              }
            />
          ))}
        </div>
      </div>
      {hasWriteAccess && (
        <div className="shrink-0 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <CommentComposer
            projectId={projectId}
            objectId={objectId}
            objectType={objectType}
            objectStartTime={objectStartTime}
            pendingSelection={pendingSelection}
            onSelectionUsed={onSelectionUsed}
            onDraftChange={onDraftChange}
            onMentionDropdownChange={onMentionDropdownChange}
            onCommentCreated={async () => {
              await invalidateCommentQueries();
              commentsContainerRef.current?.scrollTo({
                top: commentsContainerRef.current.scrollHeight,
                behavior: "smooth",
              });
            }}
          />
        </div>
      )}
    </div>
  );
}
