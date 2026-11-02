/* eslint-disable @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
import { ConfirmDialog } from "@/src/components/ui/ConfirmDialog";

export function EvaluatorBulkDeleteDialog({
  open,
  scope,
  isDeleting,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  scope: "selected" | "allMatching";
  isDeleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        scope === "allMatching"
          ? "Delete all matching evaluators?"
          : "Delete selected evaluators?"
      }
      description="All versions and evaluation rule assignments will be deleted."
      confirmLabel="Delete evaluators"
      loading={isDeleting}
      onConfirm={onConfirm}
    />
  );
}
