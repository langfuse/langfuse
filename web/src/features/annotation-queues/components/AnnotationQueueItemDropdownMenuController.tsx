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

type AnnotationQueueItemDropdownMenuControllerProps = {
  projectId: string;
  objectId: string;
  objectType: AnnotationQueueObjectType;
  children: (control: {
    disabled: { reason: string } | undefined;
    totalCount: number;
  }) => ReactNode;
};

export function AnnotationQueueItemDropdownMenuController({
  projectId,
  objectId,
  objectType,
  children,
}: AnnotationQueueItemDropdownMenuControllerProps) {
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
  const totalCount = queues.data?.totalCount ?? 0;

  return (
    <DropdownMenu
      open={hasAccess && isDropdownOpen}
      onOpenChange={(open) => {
        if (hasAccess) setIsDropdownOpen(open);
      }}
    >
      <DropdownMenuTrigger asChild>
        {children({ disabled, totalCount })}
      </DropdownMenuTrigger>
      {!isLoading ? (
        <AnnotationQueueItemMenuContent
          projectId={projectId}
          queues={
            (queues.data?.queues ?? []) satisfies AnnotationQueueItemMenuQueue[]
          }
          onQueueItemToggle={handleQueueItemToggle}
        />
      ) : null}
    </DropdownMenu>
  );
}
