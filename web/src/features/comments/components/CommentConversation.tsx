import { useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/router";
import { type CommentObjectType } from "@langfuse/shared";
import { api, type RouterOutputs } from "@/src/utils/api";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Badge } from "@/src/components/ui/badge";
import { Search, Trash, X } from "lucide-react";
import { getRelativeTimestampFromNow } from "@/src/utils/dates";
import { stripMarkdown } from "@/src/utils/markdown";
import { ReactionBar } from "../ReactionBar";
import { ReactionPicker } from "../ReactionPicker";
import { CommentCard } from "./CommentCard";

function humanizeJsonPath(path: string): string {
  if (path === "$") return "(root)";
  return path
    .replace(/^\$\.?/, "")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean)
    .join(" › ");
}

export function CommentConversation({
  projectId,
  objectId,
  objectType,
  comments,
  currentUserId,
  hasWriteAccess,
  isDrawerOpen,
  containerRef: commentsContainerRef,
  onCommentChange,
}: {
  projectId: string;
  objectId: string;
  objectType: CommentObjectType;
  comments: RouterOutputs["comments"]["getByObjectId"];
  currentUserId?: string;
  hasWriteAccess: boolean;
  isDrawerOpen: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  onCommentChange: () => Promise<void>;
}) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const didInitialAutoscrollRef = useRef(false);
  const hash = router.asPath.split("#")[1];
  const highlightedCommentId = hash?.startsWith("comment-")
    ? hash.slice("comment-".length)
    : null;
  const utils = api.useUtils();
  const deleteComment = api.comments.delete.useMutation({
    onSuccess: onCommentChange,
  });
  const addReaction = api.commentReactions.add.useMutation({
    onSuccess: (_data, { commentId }) =>
      utils.commentReactions.listForComment.invalidate({
        projectId,
        commentId,
      }),
  });
  const removeReaction = api.commentReactions.remove.useMutation({
    onSuccess: (_data, { commentId }) =>
      utils.commentReactions.listForComment.invalidate({
        projectId,
        commentId,
      }),
  });

  // Keep the DOM scroll position on the linked comment or the latest conversation.
  useEffect(() => {
    const container = commentsContainerRef.current;
    if (!comments || !container) return;
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
  }, [comments, highlightedCommentId, commentsContainerRef]);

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

  const sortedComments = [...comments].sort(
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
    <>
      {comments.length > 0 && (
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
              ? `${filteredComments.length} of ${comments.length} comments`
              : `${comments.length} comment${comments.length === 1 ? "" : "s"}`}
          </p>
        </div>
      )}
      <div
        ref={commentsContainerRef}
        className="min-h-24 flex-1 overflow-y-auto px-4 py-4"
      >
        <div className="flex min-h-full flex-col justify-end gap-4">
          {filteredComments.length === 0 && (
            <p className="text-muted-foreground py-6 text-sm">
              {query ? "No comments match your search." : "No comments yet."}
            </p>
          )}
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
              isOwnComment={currentUserId === comment.authorUserId}
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
                hasWriteAccess && currentUserId === comment.authorUserId ? (
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
    </>
  );
}
