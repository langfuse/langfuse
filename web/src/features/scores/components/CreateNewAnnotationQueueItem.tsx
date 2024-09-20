import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/src/components/ui/dropdown-menu";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { type AnnotationQueueObjectType } from "@langfuse/shared";
import { ExternalLink, LockIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

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
  const addToQueueMutation = api.annotationQueueItems.create.useMutation();
  const removeFromQueueMutation = api.annotationQueueItems.delete.useMutation();

  if (!hasAccess) {
    return (
      <DropdownMenuItem>
        <LockIcon className="ml-1.5 h-3 w-3" aria-hidden="true" />
        In {queues.data?.totalCount ?? 0} queue(s)
      </DropdownMenuItem>
    );
  }

  return queues.data && Boolean(queues.data.queues.length) ? (
    <DropdownMenuSub
      key="queue"
      open={isDropdownOpen}
      onOpenChange={setIsDropdownOpen}
    >
      <DropdownMenuSubTrigger>
        <span>
          {queues.data?.totalCount
            ? `In ${queues.data?.totalCount ?? 0} queue(s)`
            : "Add item to queue"}
        </span>
        <DropdownMenuPortal>
          <DropdownMenuSubContent>
            {queues.data.queues.map((queue) => (
              <DropdownMenuCheckboxItem
                key={queue.id}
                className="hover:bg-accent"
                checked={queue.includesItem}
                onClick={async (event) => {
                  if (!queue.includesItem) {
                    await addToQueueMutation.mutateAsync({
                      projectId,
                      objectId: itemId,
                      objectType: itemType,
                      queueId: queue.id,
                    });
                  } else {
                    await removeFromQueueMutation.mutateAsync({
                      projectId,
                      objectId: itemId,
                      objectType: itemType,
                      queueId: queue.id,
                    });
                  }
                  // TODO: ensure modal remains open after annotation queue item is added/removed
                  event.preventDefault();
                }}
              >
                {queue.name}
              </DropdownMenuCheckboxItem>
            ))}
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
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSubTrigger>
    </DropdownMenuSub>
  ) : (
    <DropdownMenuItem>No queues defined</DropdownMenuItem>
  );
};
