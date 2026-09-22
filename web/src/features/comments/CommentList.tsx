/* eslint-disable @repo/no-null-render */
import { useRef } from "react";
import { Spinner } from "@/src/components/design-system/Spinner/Spinner";
import { Button } from "@/src/components/ui/button";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { type CommentObjectType } from "@langfuse/shared";
import { useSession } from "next-auth/react";
import { CommentComposer } from "./components/CommentComposer";
import { CommentConversation } from "./components/CommentConversation";
import { refreshCommentQueries } from "./actions/refreshCommentQueries";
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
  const commentsContainerRef = useRef<HTMLDivElement>(null);
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
  if (!hasReadAccess || session.status !== "authenticated") return <></>;
  if (comments.isPending)
    return (
      <div className="flex justify-center p-6">
        <Spinner size="sm" />
        <span className="sr-only">Loading comments</span>
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
  const refresh = () =>
    refreshCommentQueries({
      utils,
      target: { projectId, objectId, objectType },
      onCommentChange,
    });
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden",
        cardView && "rounded-md",
      )}
    >
      {cardView ? (
        <h3 className="shrink-0 border-b px-4 py-3 text-sm font-bold">
          Comments
        </h3>
      ) : null}
      <CommentConversation
        projectId={projectId}
        objectId={objectId}
        objectType={objectType}
        comments={comments.data}
        currentUserId={session.data?.user?.id}
        hasWriteAccess={hasWriteAccess}
        isDrawerOpen={isDrawerOpen}
        containerRef={commentsContainerRef}
        onCommentChange={refresh}
      />
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
              await refresh();
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
