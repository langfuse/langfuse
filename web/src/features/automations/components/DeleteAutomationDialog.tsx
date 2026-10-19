import { Dialog } from "@/src/components/design-system/Dialog/Dialog";

export interface DeleteAutomationDialogProps {
  isPending: boolean;
  onConfirm: () => void;
}

export function DeleteAutomationDialog({
  isPending,
  onConfirm,
}: DeleteAutomationDialogProps) {
  return (
    <Dialog
      size="sm"
      title="Please confirm"
      text="This action permanently deletes this automation and execution history. This cannot be undone."
      actions={[
        {
          label: "Delete Automation",
          variant: "destructive",
          loading: isPending,
          onClick: onConfirm,
        },
      ]}
    />
  );
}
