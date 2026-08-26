import {
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/src/components/ui/dropdown-menu";
import { StatusBadge } from "@/src/components/ui/StatusBadge/StatusBadge";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { type MouseEvent } from "react";

export type AnnotationQueueItemMenuQueue = {
  id: string;
  name: string;
  itemId?: string;
  status?: string;
};

type AnnotationQueueItemMenuContentProps = {
  projectId: string;
  queues: AnnotationQueueItemMenuQueue[];
  onQueueItemToggle: (
    queueId: string,
    queueName: string,
    itemId?: string,
  ) => void;
};

export function AnnotationQueueItemMenuContent({
  projectId,
  queues,
  onQueueItemToggle,
}: AnnotationQueueItemMenuContentProps) {
  const preventMenuItemAction = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <DropdownMenuContent className="max-h-[min(300px,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto">
      <DropdownMenuLabel>In queue(s)</DropdownMenuLabel>
      {queues.length ? (
        queues.map((queue) => (
          <DropdownMenuCheckboxItem
            key={queue.id}
            className="hover:bg-accent"
            checked={!!queue.itemId}
            onSelect={(event) => event.preventDefault()}
            onClick={(event) => {
              preventMenuItemAction(event);
              onQueueItemToggle(queue.id, queue.name, queue.itemId);
            }}
          >
            {queue.name}
            {queue.status ? (
              <span className="ml-2">
                <StatusBadge type={queue.status.toLowerCase()} isLive={false} />
              </span>
            ) : null}
          </DropdownMenuCheckboxItem>
        ))
      ) : (
        <DropdownMenuItem onClick={preventMenuItemAction}>
          No queues defined
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem className="hover:bg-accent" asChild>
        <div>
          <ExternalLink className="mr-2 h-4 w-4" />
          <Link href={`/project/${projectId}/annotation-queues`}>
            Manage queues
          </Link>
        </div>
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}
