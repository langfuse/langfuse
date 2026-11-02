import { type api } from "@/src/utils/api";
import { type CommentObjectType } from "@langfuse/shared";

export async function refreshCommentQueries({
  utils,
  target,
  onCommentChange,
}: {
  utils: Pick<ReturnType<typeof api.useUtils>, "comments">;
  target: {
    projectId: string;
    objectId: string;
    objectType: CommentObjectType;
  };
  onCommentChange?: () => void | Promise<void>;
}) {
  const { projectId, objectId, objectType } = target;
  const queryTarget = { projectId, objectId, objectType };
  await Promise.allSettled([
    utils.comments.getByObjectId.invalidate(queryTarget),
    utils.comments.getCountByObjectId.invalidate(queryTarget),
    utils.comments.getCountByObjectType.invalidate({ projectId, objectType }),
    ...(objectType === "TRACE"
      ? [
          utils.comments.getTraceCommentCountsBySessionId.invalidate({
            projectId,
          }),
        ]
      : []),
    Promise.resolve().then(() => onCommentChange?.()),
  ]);
}
