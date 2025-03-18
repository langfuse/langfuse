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
import { ChevronDown, ExternalLink } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useState, useCallback } from "react";

export const CreateNewAnnotationQueueItem = ({
  projectId,
  objectId,
  objectType,
}: {
  projectId: string;
  objectId: string;
  objectType: AnnotationQueueObjectType;
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const session = useSession();
  const hasAccess = useHasProjectAccess({
    projectId: projectId,
    scope: "annotationQueues:CUD",
  });
  const queues = api.annotationQueues.byObjectId.useQuery(
    {
      projectId,
      objectId,
      objectType,
    },
    { enabled: session.status === "authenticated" },
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
        } else {
          const confirmRemoval = confirm(
            `Are you sure you want to remove this item from the queue "${queueName}"?`,
          );
          if (confirmRemoval) {
            await removeFromQueueMutation.mutateAsync({
              projectId,
              itemIds: [itemId],
            });
          }
        }
        // Manually invalidate the query to refresh the data
        await utils.annotationQueues.byObjectId.invalidate({
          projectId,
          objectId,
          objectType,
        });
      } catch (error) {
        console.error("Error toggling queue item:", error);
      }
    },
    [
      addToQueueMutation,
      removeFromQueueMutation,
      projectId,
      objectId,
      objectType,
      utils.annotationQueues,
    ],
  );

  if (session.status !== "authenticated" || queues.isLoading) {
    return (
      <Button
        variant="secondary"
        disabled={session.status !== "authenticated"}
        className="rounded-l-none rounded-r-md border-l-2"
      >
        <span className="relative mr-1 text-xs">
          <ChevronDown className="h-3 w-3" />
        </span>
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
          variant="secondary"
          disabled={!hasAccess}
          className="rounded-l-none rounded-r-md border-l-2"
        >
          {queues.data?.totalCount ? (
            <span className="relative mr-1 text-xs">
              <ChevronDown className="h-3 w-3 text-secondary-foreground" />
              <span className="absolute -top-1.5 left-2.5 flex max-h-[0.8rem] min-w-[0.8rem] items-center justify-center rounded-full border border-muted-foreground bg-accent-light-blue px-[0.2rem] text-[8px]">
                {queues.data?.totalCount > 99 ? "99+" : queues.data?.totalCount}
              </span>
            </span>
          ) : (
            <span className="relative mr-1 text-xs">
              <ChevronDown className="h-3 w-3" />
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
              checked={!!queue.itemId}
              onSelect={(event) => {
                event.preventDefault();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleQueueItemToggle(queue.id, queue.name, queue.itemId);
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
          <DropdownMenuItem
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            No queues defined
          </DropdownMenuItem>
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
