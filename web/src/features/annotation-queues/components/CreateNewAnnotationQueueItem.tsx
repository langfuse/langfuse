import { StatusBadge } from "@/src/components/layouts/status-badge";
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
import { ChevronDown, ExternalLink } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useState, useCallback } from "react";

export const CreateNewAnnotationQueueItem = ({
  projectId,
  objectId,
  objectType,
  variant = "secondary",
  size = "default",
}: {
  projectId: string;
  objectId: string;
  objectType: AnnotationQueueObjectType;
  variant?: "outline" | "secondary";
  size?: "default" | "sm" | "xs" | "lg" | "icon" | "icon-xs" | "icon-sm";
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
        variant={variant}
        size={size}
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
          variant={variant}
          size={size}
          disabled={!hasAccess}
          className="rounded-l-none rounded-r-md border-l-2"
        >
          {queues.data?.totalCount ? (
            <span className="relative mr-1 text-xs">
              <ChevronDown className="h-3 w-3 text-secondary-foreground" />
              <span className="absolute -top-1 left-2.5 flex h-3 min-w-3 items-center justify-center rounded-sm bg-slate-600 px-0.5 text-[8px] font-medium text-white shadow-sm">
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
                <StatusBadge
                  type={queue.status.toLowerCase()}
                  isLive={false}
                  className="ml-2"
                />
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
