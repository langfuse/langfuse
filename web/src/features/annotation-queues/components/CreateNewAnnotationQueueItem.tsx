import { StatusBadge } from "@/src/components/layouts/status-badge";
import { Button, type ButtonProps } from "@/src/components/ui/button";
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
import { ChevronDown, ExternalLink, ListPlus } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useState, useCallback } from "react";

export const CreateNewAnnotationQueueItem = ({
  projectId,
  objectId,
  objectType,
  variant = "secondary",
  size = "default",
  layout = "toolbar",
}: {
  projectId: string;
  objectId: string;
  objectType: AnnotationQueueObjectType;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  /**
   * "toolbar" (default) is the inline split-button chevron; "menu" renders the
   * same dropdown trigger as a full-width labeled row ("Add to queue") for the
   * mobile header overflow popover.
   */
  layout?: "toolbar" | "menu";
}) => {
  const isMenu = layout === "menu";
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
        variant={isMenu ? "ghost" : variant}
        size={isMenu ? "sm" : size}
        disabled={session.status !== "authenticated"}
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
          </>
        ) : (
          <span className="relative mr-1 text-xs">
            <ChevronDown className="h-3 w-3" />
          </span>
        )}
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
          variant={isMenu ? "ghost" : variant}
          size={isMenu ? "sm" : size}
          disabled={!hasAccess}
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
              {!!queues.data?.totalCount && (
                <span className="bg-primary/50 text-primary-foreground ml-auto flex h-3.5 w-fit items-center justify-center rounded-sm px-1 text-xs shadow-xs">
                  {queues.data.totalCount > 99 ? "99+" : queues.data.totalCount}
                </span>
              )}
            </>
          ) : queues.data?.totalCount ? (
            <span className="relative mr-1 text-xs">
              <ChevronDown className="text-secondary-foreground h-3 w-3" />
              <span className="bg-primary text-primary-foreground absolute -top-1 left-2.5 flex h-3 min-w-3 items-center justify-center rounded-sm px-0.5 text-[8px] font-bold shadow-xs">
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
      <DropdownMenuContent className="max-h-[min(300px,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto">
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
