import { useCallback } from "react";
import { useSession } from "next-auth/react";
import { type AnnotationQueueObjectType } from "@langfuse/shared";

import { type AnnotationQueueItemMenuQueue } from "@/src/features/annotation-queues/components/AnnotationQueueItemMenuContent";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useHasProjectAccess } from "@/src/features/rbac";
import { type AnalyticsData } from "@/src/features/scores/types";
import { api, reportNonTrpcError } from "@/src/utils/api";

export function useAnnotationQueueItemMenu({
  projectId,
  objectId,
  objectType,
  analyticsData,
}: {
  projectId: string;
  objectId: string;
  objectType: AnnotationQueueObjectType;
  analyticsData: Pick<AnalyticsData, "source" | "isV4">;
}) {
  const capture = usePostHogClientCapture();
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
  const targetType = (
    {
      TRACE: "trace",
      OBSERVATION: "observation",
      SESSION: "session",
    } as const
  )[objectType];
  const type = objectType === "SESSION" ? "session" : "trace";
  const queueCount = queues.data?.totalCount ?? 0;

  const handleQueueItemToggle = useCallback(
    async (queueId: string, queueName: string, itemId?: string) => {
      try {
        if (!itemId) {
          const result = await addToQueueMutation.mutateAsync({
            projectId,
            objectIds: [objectId],
            objectType,
            queueId,
          });
          if (result.createdCount > 0) {
            capture("annotation_queues:item_added", {
              ...analyticsData,
              type,
              targetType,
              objectType,
              queueCount: 1,
            });
          }
        } else if (
          confirm(
            `Are you sure you want to remove this item from the queue "${queueName}"?`,
          )
        ) {
          const result = await removeFromQueueMutation.mutateAsync({
            projectId,
            itemIds: [itemId],
          });
          if (result.deletedCount > 0) {
            capture("annotation_queues:item_removed", {
              ...analyticsData,
              type,
              targetType,
              objectType,
              queueCount: 1,
            });
          }
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
      analyticsData,
      capture,
      objectId,
      objectType,
      projectId,
      removeFromQueueMutation,
      targetType,
      type,
      utils.annotationQueues,
    ],
  );

  const handleOpen = useCallback(() => {
    capture("annotation:entry_click", {
      ...analyticsData,
      type,
      targetType,
      entryPoint: "queue_button",
    });
  }, [analyticsData, capture, targetType, type]);

  const handleManageClick = useCallback(() => {
    capture("annotation_queues:manage_click", {
      ...analyticsData,
      type,
      targetType,
      objectType,
      queueCount,
    });
  }, [analyticsData, capture, objectType, queueCount, targetType, type]);

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
    totalCount: queueCount,
    queues: (queues.data?.queues ??
      []) satisfies AnnotationQueueItemMenuQueue[],
    handleQueueItemToggle,
    handleOpen,
    handleManageClick,
  };
}
