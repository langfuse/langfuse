import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";

export interface DeleteAutomationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  onConfirm: () => void;
}

export function DeleteAutomationDialog({
  open,
  onOpenChange,
  isPending,
  onConfirm,
}: DeleteAutomationDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Please confirm"
      description="This action permanently deletes this automation and execution history. This cannot be undone."
      confirmLabel="Delete Automation"
      loading={isPending}
      onConfirm={onConfirm}
    />
  );
}
