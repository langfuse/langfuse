import { StatusBadge } from "@/src/components/layouts/status-badge";
import { Badge } from "@/src/components/ui/badge";
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
import { cn } from "@/src/utils/tailwind";
import {
  AnnotationQueueStatus,
  type AnnotationQueueObjectType,
} from "@langfuse/shared";
import { ChevronDown, ExternalLink, PlusIcon } from "lucide-react";
import { useSession } from "next-auth/react";
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
  const session = useSession();
  const hasAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "annotationQueues:CUD",
  });
  const queues = api.annotationQueueItems.getItemsByObjectId.useQuery(
    {
      projectId,
      objectId: itemId,
      objectType: itemType,
    },
    { enabled: session.status === "authenticated" },
  );
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
              queueId,
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

  if (session.status !== "authenticated" || queues.isLoading) {
    return (
      <Button
        variant="ghost"
        disabled
        size="icon"
        className="h-6 w-8 px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
      >
        <ChevronDown className="h-3 w-3" />
      </Button>
    );
  }

  return (
    <DropdownMenu
      key="queue"
      open={isDropdownOpen}
      onOpenChange={() => {
        if (hasAccess) {
          setIsDropdownOpen(!isDropdownOpen);
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          disabled={!hasAccess}
          size="icon"
          className="ml-0.5 h-6 w-8 px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
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
              {queue.status && (
                <Badge
                  className={cn(
                    "ml-2 px-1 py-0.5 text-[10px] capitalize",
                    queue.status === AnnotationQueueStatus.COMPLETED
                      ? "bg-light-green text-dark-green"
                      : "bg-light-yellow text-dark-yellow",
                  )}
                  variant="outline"
                >
                  {queue.status.toLowerCase()}
                </Badge>
              )}
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
