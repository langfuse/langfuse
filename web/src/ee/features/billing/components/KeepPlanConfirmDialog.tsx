import { Dialog } from "@/src/components/design-system/Dialog/Dialog";

type KeepPlanConfirmDialogProps = {
  isProcessing: boolean;
  onConfirm: () => void;
};

/** Confirms removing a scheduled plan switch. */
export function KeepPlanConfirmDialog({
  isProcessing,
  onConfirm,
}: KeepPlanConfirmDialogProps) {
  return (
    <Dialog
      title="Confirm Keeping Current Plan"
      closeLabel="Go Back"
      actions={[
        {
          label: "Confirm Keep Plan",
          loading: isProcessing,
          onClick: onConfirm,
        },
      ]}
    >
      <Dialog.Body>
        <p>
          You have a scheduled plan change on your current subscription. Keeping
          your current plan will remove that schedule and you will remain on
          your existing plan.
        </p>
        <p>
          Your features and pricing will stay as-is; usage continues to be
          billed under your current plan. Do you want to keep your current plan
          and cancel the scheduled change?
        </p>
      </Dialog.Body>
    </Dialog>
  );
}
