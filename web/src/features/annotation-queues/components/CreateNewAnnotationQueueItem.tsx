import { Button, type ButtonProps } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  AnnotationQueueItemMenu,
  type AnnotationQueueItemMenuQueue,
} from "@/src/features/annotation-queues/components/AnnotationQueueItemMenu";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api, reportNonTrpcError } from "@/src/utils/api";
import { type AnnotationQueueObjectType } from "@langfuse/shared";
import { ChevronDown, ListPlus } from "lucide-react";
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
  const isMenu = layout === "menu";
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

  const totalCount = queues.data?.totalCount ?? 0;
  const count = totalCount > 99 ? "99+" : totalCount;
  const trigger = (
    <Button
      variant={isMenu ? "ghost" : variant}
      size={isMenu ? "sm" : size}
      disabled={
        session.status !== "authenticated" || queues.isLoading || !hasAccess
      }
      className={
        isMenu
          ? "w-full justify-start gap-2 font-normal"
          : "rounded-l-none rounded-r-md border-l-2"
      }
    >
      {isMenu ? (
        <>
          <ListPlus className="h-4 w-4" />
          <span className="text-sm">Add to queue</span>
          {totalCount > 0 ? (
            <span className="bg-primary/50 text-primary-foreground ml-auto flex h-3.5 w-fit items-center justify-center rounded-sm px-1 text-xs shadow-xs">
              {count}
            </span>
          ) : null}
        </>
      ) : totalCount > 0 ? (
        <span className="relative mr-1 text-xs">
          <ChevronDown className="text-secondary-foreground h-3 w-3" />
          <span className="bg-primary text-primary-foreground absolute -top-1 left-2.5 flex h-3 min-w-3 items-center justify-center rounded-sm px-0.5 text-[8px] font-bold shadow-xs">
            {count}
          </span>
        </span>
      ) : (
        <span className="relative mr-1 text-xs">
          <ChevronDown className="h-3 w-3" />
        </span>
      )}
    </Button>
  );

  if (session.status !== "authenticated" || queues.isLoading) {
    return trigger;
  }

  return (
    <DropdownMenu
      open={isDropdownOpen}
      onOpenChange={(open) => {
        if (hasAccess) setIsDropdownOpen(open);
      }}
    >
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
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
