import {
  Copy,
  Link2,
  ListTree,
  MoreVertical,
  Pencil,
  SquarePercent,
  Trash2,
} from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export function EvaluatorActionsCell({
  hasActiveRules,
  canViewExecutions,
  onViewScores,
  onViewExecutions,
  onManageRules,
  onClone,
  onEdit,
  onDelete,
}: {
  hasActiveRules: boolean;
  canViewExecutions: boolean;
  onViewScores: () => void;
  onViewExecutions: () => void;
  onManageRules: () => void;
  onClone: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const capture = usePostHogClientCapture();

  const handlePrimaryAction = () => {
    const action = hasActiveRules ? "view_scores" : "attach_rule";
    capture("evaluators:overview_action_click", { action });
    if (hasActiveRules) {
      onViewScores();
    } else {
      onManageRules();
    }
  };

  return (
    <div className="flex w-full min-w-0 items-center justify-start gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-32 shrink-0"
        onClick={handlePrimaryAction}
      >
        {hasActiveRules ? (
          <>
            <SquarePercent className="mr-2 h-4 w-4" />
            View scores
          </>
        ) : (
          <>
            <Link2 className="mr-2 h-4 w-4" />
            Attach to rule
          </>
        )}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Evaluator actions"
            className="shrink-0"
          >
            <span className="sr-only">Open menu</span>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canViewExecutions ? (
            <DropdownMenuItem onClick={onViewExecutions}>
              <ListTree className="mr-2 h-4 w-4" />
              View executions
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onClone}>
            <Copy className="mr-2 h-4 w-4" />
            Clone
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
