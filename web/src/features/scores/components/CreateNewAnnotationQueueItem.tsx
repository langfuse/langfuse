import { Button } from "@/src/components/ui/button";
import {
  DropdownMenuItem,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
} from "@/src/components/ui/dropdown-menu";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { type AnnotationQueueObjectType } from "@langfuse/shared";
import { ChevronDown, ExternalLink, LockIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useState, useCallback } from "react";

export const CreateNewAnnotationQueueItem = ({
  projectId,
  itemId,
  itemType,
}: {
  projectId: string;
  itemId: string;
  itemType: AnnotationQueueObjectType;
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const hasAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "scoreConfigs:CUD",
  });
  const queues = api.annotationQueueItems.getItemsByObjectId.useQuery({
    projectId,
    objectId: itemId,
    objectType: itemType,
  });
  const utils = api.useUtils();
  const addToQueueMutation = api.annotationQueueItems.create.useMutation();
  const removeFromQueueMutation = api.annotationQueueItems.delete.useMutation();

  const handleQueueItemToggle = useCallback(
    async (queueId: string, includesItem: boolean, queueName: string) => {
      try {
        if (!includesItem) {
          await addToQueueMutation.mutateAsync({
            projectId,
            objectId: itemId,
            objectType: itemType,
            queueId,
          });
        } else {
          const confirmRemoval = confirm(
            `Are you sure you want to remove this item from the queue "${queueName}"?`,
          );
          if (confirmRemoval) {
            await removeFromQueueMutation.mutateAsync({
              projectId,
              objectId: itemId,
              objectType: itemType,
            });
          }
        }
        // Manually invalidate the query to refresh the data
        await utils.annotationQueueItems.getItemsByObjectId.invalidate({
          projectId,
          objectId: itemId,
          objectType: itemType,
        });
      } catch (error) {
        console.error("Error toggling queue item:", error);
      }
    },
    [
      addToQueueMutation,
      removeFromQueueMutation,
      projectId,
      itemId,
      itemType,
      utils.annotationQueueItems,
    ],
  );

  if (!hasAccess) {
    return (
      <DropdownMenuItem>
        <LockIcon className="ml-1.5 h-3 w-3" aria-hidden="true" />
        In {queues.data?.totalCount ?? 0} queue(s)
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenu
      key="queue"
      open={isDropdownOpen}
      onOpenChange={setIsDropdownOpen}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          disabled={!hasAccess}
          size="icon"
          className="ml-0.5 h-6 w-8 px-0 focus-visible:ring-1 focus-visible:ring-offset-0"
        >
          {queues.data?.totalCount ? (
            <span className="relative mr-1 text-xs">
              <ChevronDown className="h-3 w-3" />
              <span className="absolute -top-1.5 left-2.5 flex max-h-[0.8rem] min-w-[0.8rem] items-center justify-center rounded-full border border-muted-foreground bg-accent-light-blue px-[0.2rem] text-[8px]">
                {queues.data?.totalCount > 99 ? "99+" : queues.data?.totalCount}
              </span>
            </span>
          ) : (
            <span className="relative mr-1 text-xs">
              <ChevronDown className="h-3 w-3" />
              <span className="absolute -top-1.5 left-2.5 flex h-[0.8rem] w-[0.8rem] items-center justify-center rounded-full border border-muted-foreground bg-accent-light-blue text-[8px]">
                <PlusIcon className="h-2 w-2" />
              </span>
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>In queue(s)</DropdownMenuLabel>
        {queues.data?.queues.length ? (
          queues.data?.queues.map((queue) => (
            <DropdownMenuCheckboxItem
              key={queue.id}
              className="hover:bg-accent"
              checked={queue.includesItem}
              onSelect={(event) => {
                event.preventDefault();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleQueueItemToggle(queue.id, queue.includesItem, queue.name);
              }}
            >
              {queue.name}
            </DropdownMenuCheckboxItem>
          ))
        ) : (
          <DropdownMenuItem>No queues defined</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          key="manage-queues"
          className="hover:bg-accent"
          asChild
        >
          <div>
            <ExternalLink className="mr-2 h-4 w-4" />
            <Link href={`/project/${projectId}/annotation-queues`}>
              Manage queues
            </Link>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
