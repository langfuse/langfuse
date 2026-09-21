import { ListPlus } from "lucide-react";
import { useState } from "react";
import { type AnnotationQueueObjectType } from "@langfuse/shared";

import {
  DropdownMenuPortal,
  DropdownMenuSearchInput,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/src/components/ui/dropdown-menu";
import { AnnotationQueueItemCountBadge } from "@/src/features/annotation-queues/components/AnnotationQueueItemCountBadge";
import { AnnotationQueueItemMenuItems } from "@/src/features/annotation-queues/components/AnnotationQueueItemMenuContent";
import { useAnnotationQueueItemMenu } from "@/src/features/annotation-queues/hooks/useAnnotationQueueItemMenu";

const SEARCHABLE_FROM = 8;

export function AnnotationQueueItemSubMenu({
  projectId,
  objectId,
  objectType,
}: {
  projectId: string;
  objectId: string;
  objectType: AnnotationQueueObjectType;
}) {
  const [query, setQuery] = useState("");
  const { disabled, totalCount, queues, handleQueueItemToggle } =
    useAnnotationQueueItemMenu({ projectId, objectId, objectType });
  const normalizedQuery = query.trim().toLowerCase();
  const filteredQueues = normalizedQuery
    ? queues.filter((queue) =>
        queue.name.toLowerCase().includes(normalizedQuery),
      )
    : queues;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger
        disabled={disabled !== undefined}
        title={disabled?.reason}
      >
        <ListPlus className="mr-2 h-4 w-4" />
        Annotation queue
        {totalCount > 0 && (
          <AnnotationQueueItemCountBadge
            totalCount={totalCount}
            layout="menu"
          />
        )}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="flex max-h-[min(300px,var(--radix-dropdown-menu-content-available-height))] flex-col">
          {queues.length >= SEARCHABLE_FROM && (
            <>
              <DropdownMenuSearchInput
                value={query}
                onChange={setQuery}
                placeholder="Search queues..."
              />
              <DropdownMenuSeparator />
            </>
          )}
          <div className="overflow-y-auto">
            <AnnotationQueueItemMenuItems
              projectId={projectId}
              queues={filteredQueues}
              emptyLabel={
                queues.length ? "No matching queues" : "No queues yet"
              }
              onQueueItemToggle={handleQueueItemToggle}
            />
          </div>
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
