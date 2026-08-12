import {
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

export function EvaluatorActionsCell({
  hasActiveRules,
  canViewExecutions,
  onViewScores,
  onViewExecutions,
  onManageRules,
  onEdit,
  onDelete,
}: {
  hasActiveRules: boolean;
  canViewExecutions: boolean;
  onViewScores: () => void;
  onViewExecutions: () => void;
  onManageRules: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex w-full min-w-0 items-center justify-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={hasActiveRules ? onViewScores : onManageRules}
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
          <DropdownMenuItem onClick={onDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
