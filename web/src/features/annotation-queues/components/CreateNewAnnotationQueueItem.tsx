import { type ButtonProps } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  AnnotationQueueItemMenu,
  type AnnotationQueueItemMenuQueue,
} from "@/src/features/annotation-queues/components/AnnotationQueueItemMenu";
import { AnnotationQueueItemTrigger } from "@/src/features/annotation-queues/components/AnnotationQueueItemTrigger";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api, reportNonTrpcError } from "@/src/utils/api";
import { type AnnotationQueueObjectType } from "@langfuse/shared";
import { useCallback, useState } from "react";
import { useSession } from "next-auth/react";

type CreateNewAnnotationQueueItemProps = {
  projectId: string;
  objectId: string;
  objectType: AnnotationQueueObjectType;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  /**
   * "toolbar" is the inline split-button chevron; "menu" renders the same
   * dropdown trigger as a full-width labeled row for the mobile header.
   */
  layout?: "toolbar" | "menu";
};

export function CreateNewAnnotationQueueItem({
  projectId,
  objectId,
  objectType,
  variant = "secondary",
  size = "default",
  layout = "toolbar",
}: CreateNewAnnotationQueueItemProps) {
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

  const triggerProps = {
    layout,
    variant,
    size,
    disabled:
      session.status !== "authenticated" || queues.isLoading || !hasAccess,
    totalCount: queues.data?.totalCount ?? 0,
  } satisfies React.ComponentProps<typeof AnnotationQueueItemTrigger>;

  if (session.status !== "authenticated" || queues.isLoading) {
    return <AnnotationQueueItemTrigger {...triggerProps} />;
  }

  return (
    <DropdownMenu
      open={isDropdownOpen}
      onOpenChange={(open) => {
        if (hasAccess) setIsDropdownOpen(open);
      }}
    >
      <DropdownMenuTrigger asChild>
        <AnnotationQueueItemTrigger {...triggerProps} />
      </DropdownMenuTrigger>
      <AnnotationQueueItemMenu
        projectId={projectId}
        queues={
          (queues.data?.queues ?? []) satisfies AnnotationQueueItemMenuQueue[]
        }
        onQueueItemToggle={handleQueueItemToggle}
      />
    </DropdownMenu>
  );
}
