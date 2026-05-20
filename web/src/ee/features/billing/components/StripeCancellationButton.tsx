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
import { useBillingInformation } from "./useBillingInformation";
import { api } from "@/src/utils/api";
import { useState } from "react";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { useWatchedPromiseCallback } from "@/src/hooks/useWatchedPromiseCallback";

export const StripeCancellationButton = ({
  orgId,
  variant,
  className,
}: {
  orgId: string | undefined;
  variant: "secondary" | "default";
  className?: string;
}) => {
  const { cancellation } = useBillingInformation();
  const [_opId, setOpId] = useState<string | null>(null);

  const cancelMutation = api.cloudBilling.cancelStripeSubscription.useMutation({
    onSuccess: () => {
      toast.success("Subscription will be cancelled at period end");
      setOpId(null);
      setTimeout(() => window.location.reload(), 500);
    },
    onError: () => {
      setOpId(null);
      toast.error("Failed to cancel subscription");
    },
  });

  const reactivateMutation =
    api.cloudBilling.reactivateStripeSubscription.useMutation({
      onSuccess: () => {
        toast.success("Subscription reactivated");
        setOpId(null);
        setTimeout(() => window.location.reload(), 500);
      },
      onError: () => {
        setOpId(null);
        toast.error("Failed to reactivate subscription");
      },
    });

  const [onReactivate, isReactivating] = useWatchedPromiseCallback(async () => {
    if (!orgId) return;
    try {
      // idempotency key for mutation operations with the stripe api
      let opId = _opId;
      if (!opId) {
        opId = nanoid();
        setOpId(opId);
      }
      await reactivateMutation.mutateAsync({ orgId, opId });
    } catch (_e) {
      toast.error("Failed to reactivate subscription");
    }
  }, [_opId, orgId, reactivateMutation]);

  const [onCancel, isCancelling] = useWatchedPromiseCallback(async () => {
    if (!orgId) return;
    try {
      // idempotency key for mutation operations with the stripe api
      let opId = _opId;
      if (!opId) {
        opId = nanoid();
        setOpId(opId);
      }
      await cancelMutation.mutateAsync({ orgId, opId });
    } catch (_e) {
      toast.error("Failed to cancel subscription");
    }
  }, [_opId, cancelMutation, orgId]);

  const loading = isReactivating || isCancelling;

  if (!orgId) return null;

  // Reactivate with confirm dialog
  if (cancellation?.isCancelled) {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button
            variant={variant}
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

  // Cancel with confirm dialog
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant={variant}
          disabled={loading}
          title="Cancel Subscription"
        >
          Cancel Subscription
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg">Confirm Cancellation</DialogTitle>
        </DialogHeader>
        <DialogBody className="text-sm">
          <p>
            Your subscription will not renew. You will retain access until the
            end of the current billing period
          </p>
          <p>
            Usage during the remainder of the period is still billed under your
            current plan. By confirming, you schedule the cancellation for
            period end. You can reactivate before that date if you change your
            mind.
          </p>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Keep Subscription</Button>
          </DialogClose>
          <Button variant="destructive" onClick={onCancel} disabled={loading}>
            {loading ? "Cancelling…" : "Confirm Cancellation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
