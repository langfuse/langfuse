import { Dialog } from "@/src/components/design-system/Dialog/Dialog";

type ReactivateSubscriptionConfirmDialogProps = {
  isProcessing: boolean;
  onConfirm: () => void;
};

/** Confirms removing a scheduled cancellation. */
export function ReactivateSubscriptionConfirmDialog({
  isProcessing,
  onConfirm,
}: ReactivateSubscriptionConfirmDialogProps) {
  return (
    <Dialog
      title="Confirm Reactivation: Keep Your Subscription"
      closeLabel="Cancel"
      actions={[
        {
          label: "Confirm Reactivation",
          loading: isProcessing,
          onClick: onConfirm,
        },
      ]}
    >
      <Dialog.Body>
        <p>
          Reactivating removes the scheduled cancellation. Your subscription
          will continue beyond the current billing period and renew until you
          cancel again.
        </p>
        <p>
          Your features and usage billing remain unchanged. By confirming, you
          agree to future renewals and charges.
        </p>
      </Dialog.Body>
    </Dialog>
  );
}
