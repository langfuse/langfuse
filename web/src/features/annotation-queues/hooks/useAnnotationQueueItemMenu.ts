import { useCallback } from "react";
import { useSession } from "next-auth/react";
import { type AnnotationQueueObjectType } from "@langfuse/shared";

import { type AnnotationQueueItemMenuQueue } from "@/src/features/annotation-queues/components/AnnotationQueueItemMenuContent";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api, reportNonTrpcError } from "@/src/utils/api";

export function useAnnotationQueueItemMenu({
  projectId,
  objectId,
  objectType,
}: {
  projectId: string;
  objectId: string;
  objectType: AnnotationQueueObjectType;
}) {
  const session = useSession();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueues:CUD",
  });
  const queues = api.annotationQueues.byObjectId.useQuery(
    { projectId, objectId, objectType },
    {
      enabled:
        session.status === "authenticated" &&
        Boolean(projectId) &&
        Boolean(objectId),
    },
  );
  const utils = api.useUtils();
  const addToQueueMutation = api.annotationQueueItems.createMany.useMutation();
  const removeFromQueueMutation =
    api.annotationQueueItems.deleteMany.useMutation();

  const handleQueueItemToggle = useCallback(
    async (queueId: string, queueName: string, itemId?: string) => {
      try {
        if (!itemId) {
          await addToQueueMutation.mutateAsync({
            projectId,
            objectIds: [objectId],
            objectType,
            queueId,
          });
        } else if (
          confirm(
            `Are you sure you want to remove this item from the queue "${queueName}"?`,
          )
        ) {
          await removeFromQueueMutation.mutateAsync({
            projectId,
            itemIds: [itemId],
          });
        }

        await utils.annotationQueues.byObjectId.invalidate({
          projectId,
          objectId,
          objectType,
        });
      } catch (error) {
        reportNonTrpcError(error, "annotation-queues");
      }
    },
    [
      addToQueueMutation,
      objectId,
      objectType,
      projectId,
      removeFromQueueMutation,
      utils.annotationQueues,
    ],
  );

  const isLoading = session.status !== "authenticated" || queues.isLoading;
  const disabled =
    !hasAccess || isLoading
      ? {
          reason: !hasAccess
            ? "You don't have permission to add items to annotation queues."
            : "Annotation queues are loading.",
        }
      : undefined;

  return {
    hasAccess,
    isLoading,
    disabled,
    totalCount: queues.data?.totalCount ?? 0,
    queues: (queues.data?.queues ??
      []) satisfies AnnotationQueueItemMenuQueue[],
    handleQueueItemToggle,
  };
}
