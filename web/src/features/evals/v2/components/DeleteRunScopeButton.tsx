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

export function DeleteRunScopeButton({
  projectId,
  runScope,
  onDeleted,
  variant = "destructive-secondary",
  size,
  disabled,
  iconOnly = false,
  className,
}: {
  projectId: string;
  runScope: {
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
  const deleteScope = api.evalsV2.deleteRunScope.useMutation({
    onError: (error) => trpcErrorToast(error),
  });

  const remove = async () => {
    try {
      await deleteScope.mutateAsync({
        projectId,
        runScopeId: runScope.id,
      });
    } catch {
      return;
    }

    setOpen(false);
    showSuccessToast({
      title: "Run scope deleted",
      description: `Run scope “${runScope.name}” was deleted.`,
    });
    onDeleted();
    await Promise.all([
      utils.evals.invalidate(),
      utils.evalsV2.runScopes.invalidate({ projectId }),
    ]).catch(() => undefined);
  };

  const trigger = (
    <Button
      type="button"
      variant={variant}
      size={size ?? (iconOnly ? "icon-xs" : undefined)}
      disabled={disabled}
      className={className}
      aria-label={iconOnly ? "Delete run scope" : undefined}
      onClick={() => setOpen(true)}
    >
      <Trash2 className={iconOnly ? "h-4 w-4" : "mr-1.5 h-3.5 w-3.5"} />
      {iconOnly ? null : "Delete run scope"}
    </Button>
  );

  return (
    <>
      {iconOnly ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent>Delete run scope</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete run scope?"
        description={
          runScope.evaluatorCount > 0
            ? `This permanently deletes “${runScope.name}” and disconnects ${runScope.evaluatorCount} evaluator${runScope.evaluatorCount === 1 ? "" : "s"}. Any evaluator left without another run scope will become inactive.`
            : `This permanently deletes “${runScope.name}”. This action cannot be undone.`
        }
        confirmLabel="Delete run scope"
        loading={deleteScope.isPending}
        onConfirm={remove}
      />
    </>
  );
}
