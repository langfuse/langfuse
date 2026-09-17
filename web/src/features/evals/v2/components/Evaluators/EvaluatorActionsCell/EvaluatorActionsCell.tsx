import {
  Copy,
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
        <SquarePercent className="icon-md ml-1" />
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
            <MoreVertical className="icon-lg" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canViewExecutions ? (
            <DropdownMenuItem onClick={onViewExecutions}>
              <ListTree className="icon-lg mr-2" />
              View executions
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="icon-lg mr-2" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onClone}>
            <Copy className="icon-lg mr-2" />
            Clone
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDelete}>
            <Trash2 className="icon-lg mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
