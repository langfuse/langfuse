/* eslint-disable @repo/no-style-props, @repo/no-abstracted-overlay-trigger, @typescript-eslint/no-deprecated -- Legacy UI usage retained during migration to design-system components. */
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  type CancellationFeedback,
  type CancellationReasonPlacement,
} from "@/src/ee/features/billing/utils/cancellationReasons";
import { BillingQuietLink } from "./BillingQuietLink";
import { CancelSubscriptionDialog } from "./CancelSubscriptionDialog/CancelSubscriptionDialog";
import { useBillingInformation } from "./useBillingInformation";
import { api } from "@/src/utils/api";
import { useState } from "react";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showToast } from "@/src/features/notifications/showToast";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";
import { nanoid } from "nanoid";

export const StripeCancellationButton = ({
  orgId,
  variant,
  className,
}: {
  orgId: string;
  /** "quiet-link" is small grey text: for a cancel that should be findable, not inviting. */
  variant: "secondary" | "default" | "ghost" | "quiet-link";
  className?: string;
}) => {
  const capture = usePostHogClientCapture();
  const { cancellation, organization, billingProvider } =
    useBillingInformation();
  const eventContext = { plan: organization?.plan ?? null, billingProvider };
  const [loading, setLoading] = useState(false);
  const [_opId, setOpId] = useState<string | null>(null);

  const cancelMutation = api.cloudBilling.cancelStripeSubscription.useMutation({
    onSuccess: () => {
      showSuccessToast({
        operation: "subscription.cancel",
        title: "Subscription will be cancelled at period end",
        description: "",
      });
      setLoading(false);
      setOpId(null);
      setTimeout(() => window.location.reload(), 500);
    },
    onError: (error) => {
      setLoading(false);
      setOpId(null);
      showToast({
        type: "ERROR",
        title: "Failed to cancel subscription",
        analytics: classifyTrpcToastError(error, "subscription.cancel"),
      });
    },
  });

  const reactivateMutation =
    api.cloudBilling.reactivateStripeSubscription.useMutation({
      onSuccess: () => {
        showSuccessToast({
          operation: "subscription.reactivate",
          title: "Subscription reactivated",
          description: "",
        });
        setLoading(false);
        setOpId(null);
        setTimeout(() => window.location.reload(), 500);
        // Last, so tracking can never get in the way of the reactivation.
        capture("billing_cancellation:reactivation_confirmed", eventContext);
      },
      onError: (error) => {
        setLoading(false);
        setOpId(null);
        showToast({
          type: "ERROR",
          title: "Failed to reactivate subscription",
          analytics: classifyTrpcToastError(error, "subscription.reactivate"),
        });
      },
    });

  const onReactivate = async () => {
    try {
      setLoading(true);
      // idempotency key for mutation operations with the stripe api
      let opId = _opId;
      if (!opId) {
        opId = nanoid();
        setOpId(opId);
      }
      await reactivateMutation.mutateAsync({ orgId, opId });
    } catch (error) {
      showToast({
        type: "ERROR",
        title: "Failed to reactivate subscription",
        analytics: classifyTrpcToastError(error, "subscription.reactivate"),
      });
    }
  };

  const onCancel = async (
    feedback: CancellationFeedback,
    shown: CancellationReasonPlacement,
  ) => {
    try {
      setLoading(true);
      // idempotency key for mutation operations with the stripe api
      let opId = _opId;
      if (!opId) {
        opId = nanoid();
        setOpId(opId);
      }
      await cancelMutation.mutateAsync({
        orgId,
        opId,
        feedback,
        placement: shown,
      });
    } catch (error) {
      showToast({
        type: "ERROR",
        title: "Failed to cancel subscription",
        analytics: classifyTrpcToastError(error, "subscription.cancel"),
      });
      return;
    }
    // Outside the try, so a tracking failure never reads as a failed cancel.
    capture("billing_cancellation:confirmed", {
      ...eventContext,
      ...shown,
      reason: feedback.reason,
      hasNote: Boolean(feedback.note),
    });
  };

  // Reactivate with confirm dialog
  if (cancellation?.isCancelled) {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button
            variant={variant === "quiet-link" ? "link" : variant}
            disabled={loading}
            title="Reactivate Subscription"
            className={className}
          >
            {loading ? "Working…" : "Reactivate Subscription"}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg">
              Confirm Reactivation: Keep Your Subscription
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="text-sm">
            <p>
              Reactivating removes the scheduled cancellation. Your subscription
              will continue beyond the current billing period and renew until
              you cancel again.
            </p>
            <p>
              Your features and usage billing remain unchanged. By confirming,
              you agree to future renewals and charges.
            </p>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button variant="default" onClick={onReactivate} disabled={loading}>
              {loading ? "Reactivating…" : "Confirm Reactivation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <DialogController
      renderDialog={({ closeDialog }) => (
        <CancelSubscriptionDialog
          isCancelling={loading}
          onConfirm={onCancel}
          closeDialog={closeDialog}
        />
      )}
    >
      {({ openDialog }) => {
        const open = () => {
          openDialog();
          capture("billing_cancellation:dialog_opened", eventContext);
        };
        if (variant === "quiet-link") {
          return (
            <BillingQuietLink
              label="Cancel Subscription"
              disabled={loading}
              onClick={open}
            />
          );
        }
        return (
          <Button
            variant={variant}
            disabled={loading}
            title="Cancel Subscription"
            onClick={open}
          >
            Cancel Subscription
          </Button>
        );
      }}
    </DialogController>
  );
};
