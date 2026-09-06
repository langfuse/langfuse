import {
  Copy,
  ListTree,
  MoreVertical,
  Pencil,
  SquarePercent,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

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
  const t = useTranslations("evaluationAnalytics.evaluations");
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
        {t("evaluator.actions.viewScores")}
        <SquarePercent className="ml-1 h-3.5 w-3.5" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t("evaluator.actions.label")}
            className="shrink-0"
          >
            <span className="sr-only">{t("evaluator.actions.openMenu")}</span>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canViewExecutions ? (
            <DropdownMenuItem onClick={onViewExecutions}>
              <ListTree className="mr-2 h-4 w-4" />
              {t("evaluator.actions.viewExecutions")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            {t("evaluator.actions.edit")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onClone}>
            <Copy className="mr-2 h-4 w-4" />
            {t("evaluator.actions.clone")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            {t("evaluator.actions.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
