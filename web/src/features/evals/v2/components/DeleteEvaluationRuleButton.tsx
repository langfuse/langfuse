import { useState } from "react";
import { Trash2 } from "lucide-react";

import { Button, type ButtonProps } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

export function DeleteEvaluationRuleButton({
  projectId,
  evaluationRule,
  onDeleted,
  variant = "destructive-secondary",
  size,
  disabled,
  iconOnly = false,
  className,
}: {
  projectId: string;
  evaluationRule: {
    id: string;
    name: string;
    evaluatorCount: number;
  };
  onDeleted: () => void;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  disabled?: boolean;
  iconOnly?: boolean;
  className?: string;
}) {
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);
  const deleteRule = api.evalsV2.deleteRule.useMutation({
    onError: (error) => trpcErrorToast(error),
  });

  const remove = async () => {
    try {
      await deleteRule.mutateAsync({
        projectId,
        ruleId: evaluationRule.id,
      });
    } catch {
      return;
    }

    setOpen(false);
    showSuccessToast({
      title: "Rule deleted",
      description: `Evaluation rule “${evaluationRule.name}” was deleted.`,
    });
    onDeleted();
    await Promise.all([
      utils.evals.invalidate(),
      utils.evalsV2.rules.invalidate({ projectId }),
    ]).catch(() => undefined);
  };

  const trigger = (
    <Button
      type="button"
      variant={variant}
      size={size ?? (iconOnly ? "icon-xs" : undefined)}
      disabled={disabled}
      className={className}
      aria-label={iconOnly ? "Delete rule" : undefined}
      onClick={() => setOpen(true)}
    >
      <Trash2 className={iconOnly ? "h-4 w-4" : "mr-1.5 h-3.5 w-3.5"} />
      {iconOnly ? null : "Delete rule"}
    </Button>
  );

  return (
    <>
      {iconOnly ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent>Delete rule</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete rule?"
        description={
          evaluationRule.evaluatorCount > 0
            ? `This permanently deletes “${evaluationRule.name}” and detaches ${evaluationRule.evaluatorCount} evaluator${evaluationRule.evaluatorCount === 1 ? "" : "s"} from it. Any evaluator left without another evaluation rule will become inactive.`
            : `This permanently deletes “${evaluationRule.name}”. This action cannot be undone.`
        }
        confirmLabel="Delete rule"
        loading={deleteRule.isPending}
        onConfirm={remove}
      />
    </>
  );
}
