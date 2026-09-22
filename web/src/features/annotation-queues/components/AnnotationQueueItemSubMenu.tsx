import { ListPlus } from "lucide-react";
import { type AnnotationQueueObjectType } from "@langfuse/shared";

import {
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/src/components/ui/dropdown-menu";
import { AnnotationQueueItemCountBadge } from "@/src/features/annotation-queues/components/AnnotationQueueItemCountBadge";
import { AnnotationQueueItemMenuItems } from "@/src/features/annotation-queues/components/AnnotationQueueItemMenuContent";
import { useAnnotationQueueItemMenu } from "@/src/features/annotation-queues/hooks/useAnnotationQueueItemMenu";
import { type AnalyticsData } from "@/src/features/scores/types";

export function AnnotationQueueItemSubMenu({
  projectId,
  objectId,
  objectType,
  analyticsData,
}: {
  projectId: string;
  objectId: string;
  objectType: AnnotationQueueObjectType;
  analyticsData: Pick<AnalyticsData, "source" | "isV4">;
}) {
  const {
    disabled,
    totalCount,
    queues,
    handleQueueItemToggle,
    handleOpen,
    handleManageClick,
  } = useAnnotationQueueItemMenu({
    projectId,
    objectId,
    objectType,
    analyticsData,
  });

  return (
    <DropdownMenuSub
      onOpenChange={(open) => {
        if (open) handleOpen();
      }}
    >
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
          <div className="overflow-y-auto">
            <AnnotationQueueItemMenuItems
              projectId={projectId}
              queues={queues}
              emptyLabel="No queues yet"
              onQueueItemToggle={handleQueueItemToggle}
              onManageClick={handleManageClick}
            />
          </div>
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
