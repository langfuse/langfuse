import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  AnnotationQueueItemMenuContent,
  type AnnotationQueueItemMenuQueue,
} from "@/src/features/annotation-queues/components/AnnotationQueueItemMenuContent";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api, reportNonTrpcError } from "@/src/utils/api";
import { type AnnotationQueueObjectType } from "@langfuse/shared";
import { type ReactNode, useCallback, useState } from "react";
import { useSession } from "next-auth/react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { type AnalyticsData } from "@/src/features/scores/types";

type AnnotationQueueItemDropdownMenuControllerProps = {
  projectId: string;
  objectId: string;
  objectType: AnnotationQueueObjectType;
  analyticsData: Pick<AnalyticsData, "source" | "isV4">;
  children: (control: {
    disabled: { reason: string } | undefined;
    totalCount: number;
    Trigger: typeof DropdownMenuTrigger;
  }) => ReactNode;
};

export function AnnotationQueueItemDropdownMenuController({
  projectId,
  objectId,
  objectType,
  analyticsData,
  children,
}: AnnotationQueueItemDropdownMenuControllerProps) {
  const capture = usePostHogClientCapture();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
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

  const isLoading = session.status !== "authenticated" || queues.isLoading;
  const disabled =
    !hasAccess || isLoading
      ? {
          reason: !hasAccess
            ? "You don't have permission to add items to annotation queues."
            : "Annotation queues are loading.",
        }
      : undefined;
  const totalCount = queues.data?.totalCount ?? 0;

  return (
    <DropdownMenu
      open={hasAccess && isDropdownOpen}
      onOpenChange={(open) => {
        if (hasAccess) {
          if (open && !isDropdownOpen) {
            capture("annotation:entry_click", {
              ...analyticsData,
              type,
              targetType,
              entryPoint: "queue_button",
            });
          }
          setIsDropdownOpen(open);
        }
      }}
    >
      {children({
        disabled,
        totalCount,
        Trigger: DropdownMenuTrigger,
      })}
      {!isLoading ? (
        <AnnotationQueueItemMenuContent
          projectId={projectId}
          queues={
            (queues.data?.queues ?? []) satisfies AnnotationQueueItemMenuQueue[]
          }
          onQueueItemToggle={handleQueueItemToggle}
          onManageClick={() =>
            capture("annotation_queues:manage_click", {
              ...analyticsData,
              type,
              targetType,
              objectType,
              queueCount,
            })
          }
        />
      ) : null}
    </DropdownMenu>
  );
}
