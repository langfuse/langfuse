import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { AnnotationQueueItemMenuContent } from "@/src/features/annotation-queues/components/AnnotationQueueItemMenuContent";
import { useAnnotationQueueItemMenu } from "@/src/features/annotation-queues/hooks/useAnnotationQueueItemMenu";
import { type AnnotationQueueObjectType } from "@langfuse/shared";
import { type ReactNode, useState } from "react";

type AnnotationQueueItemDropdownMenuControllerProps = {
  projectId: string;
  objectId: string;
  objectType: AnnotationQueueObjectType;
  children: (control: {
    disabled: { reason: string } | undefined;
    totalCount: number;
  }) => ReactNode;
};

export function AnnotationQueueItemDropdownMenuController({
  projectId,
  objectId,
  objectType,
  children,
}: AnnotationQueueItemDropdownMenuControllerProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const {
    hasAccess,
    isLoading,
    disabled,
    totalCount,
    queues,
    handleQueueItemToggle,
  } = useAnnotationQueueItemMenu({ projectId, objectId, objectType });

  return (
    <DropdownMenu
      open={hasAccess && isDropdownOpen}
      onOpenChange={(open) => {
        if (hasAccess) setIsDropdownOpen(open);
      }}
    >
      <DropdownMenuTrigger asChild>
        {children({ disabled, totalCount })}
      </DropdownMenuTrigger>
      {!isLoading ? (
        <AnnotationQueueItemMenuContent
          projectId={projectId}
          queues={queues}
          onQueueItemToggle={handleQueueItemToggle}
        />
      ) : null}
    </DropdownMenu>
  );
}
