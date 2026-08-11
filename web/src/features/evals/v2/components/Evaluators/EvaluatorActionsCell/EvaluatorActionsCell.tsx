import { MoreVertical } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";

export function EvaluatorActionsCell({
  hasActiveRules,
  canViewExecutions,
  onViewScores,
  onViewExecutions,
  onEdit,
  onDelete,
}: {
  hasActiveRules: boolean;
  canViewExecutions: boolean;
  onViewScores: () => void;
  onViewExecutions: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-[104px] shrink-0"
        onClick={hasActiveRules ? onViewScores : undefined}
      >
        {hasActiveRules ? "View scores" : "Attach to rule"}
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
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          {canViewExecutions ? (
            <DropdownMenuItem onClick={onViewExecutions}>
              View executions
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" onClick={onDelete}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
