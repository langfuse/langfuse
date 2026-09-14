import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";

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
