import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";

export function EvaluatorVersionConflictDialog({
  open,
  isOverriding,
  onOpenChange,
  onDiscard,
  onOverride,
}: {
  open: boolean;
  isOverriding: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void | Promise<void>;
  onOverride: () => void | Promise<void>;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="This evaluator was updated"
      description="Another user saved a newer version while you were editing. Discard your changes to load the latest version, or override it by saving your changes as the newest version. The other version remains in the version history."
      cancelLabel="Discard changes"
      onCancel={onDiscard}
      confirmLabel="Override changes"
      confirmVariant="default"
      loading={isOverriding}
      onConfirm={onOverride}
    />
  );
}
