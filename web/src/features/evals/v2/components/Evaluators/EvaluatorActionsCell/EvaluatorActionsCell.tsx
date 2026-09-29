import {
  Copy,
  ListTree,
  MoreVertical,
  Pencil,
  SquarePercent,
  Trash2,
} from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";

export function EvaluatorActionsCell({
  canViewExecutions,
  onViewScores,
  onViewExecutions,
  onClone,
  onEdit,
  onDelete,
}: {
  canViewExecutions: boolean;
  onViewScores: () => void;
  onViewExecutions: () => void;
  onClone: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const capture = usePostHogClientCapture();

  const handlePrimaryAction = () => {
    capture("evaluators:overview_action_click", { action: "view_scores" });
    onViewScores();
  };

  return (
    <div className="flex w-full min-w-0 items-center justify-start gap-1">
      <Button
        type="button"
        variant="link"
        size="sm"
        className="text-foreground hover:text-foreground h-auto px-0 py-0"
        onClick={handlePrimaryAction}
      >
        View scores
        <SquarePercent className="ml-1 h-3.5 w-3.5" />
      </Button>
      <DropdownMenu
        placement="bottom-end"
        items={[
          ...(canViewExecutions
            ? [
                {
                  type: "item" as const,
                  id: "view-executions",
                  title: "View executions",
                  icon: ListTree,
                  onClick: onViewExecutions,
                },
              ]
            : []),
          {
            type: "item",
            id: "edit",
            title: "Edit",
            icon: Pencil,
            onClick: onEdit,
          },
          {
            type: "item",
            id: "clone",
            title: "Clone",
            icon: Copy,
            onClick: onClone,
          },
          {
            type: "item",
            id: "delete",
            title: "Delete",
            icon: Trash2,
            onClick: onDelete,
          },
        ]}
      >
        {({ getTriggerProps }) => (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Evaluator actions"
            className="shrink-0"
            {...getTriggerProps()}
          >
            <span className="sr-only">Open menu</span>
            <MoreVertical className="h-4 w-4" />
          </Button>
        )}
      </DropdownMenu>
    </div>
  );
}
