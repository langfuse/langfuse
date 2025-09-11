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

export const StripeCancellationButton = ({
  orgId,
  variant,
}: {
  orgId: string | undefined;
  variant: "secondary" | "default";
}) => {
  const { cancellation } = useBillingInformation();
  const [loading, setLoading] = useState(false);

  const cancelMutation = api.cloudBilling.cancelStripeSubscription.useMutation({
    onSuccess: () => {
      toast.success("Subscription will be cancelled at period end");
      setLoading(false);
      setTimeout(() => window.location.reload(), 500);
    },
    onError: () => setLoading(false),
  });

  const reactivateMutation =
    api.cloudBilling.reactivateStripeSubscription.useMutation({
      onSuccess: () => {
        toast.success("Subscription reactivated");
        setLoading(false);
        setTimeout(() => window.location.reload(), 500);
      },
      onError: () => setLoading(false),
    });

  if (!orgId) return null;

  const onReactivate = async () => {
    try {
      setLoading(true);
      await reactivateMutation.mutateAsync({ orgId });
    } catch (e) {
      toast.error("Failed to reactivate subscription");
    }
  };

  const onCancel = async () => {
    try {
      setLoading(true);
      await cancelMutation.mutateAsync({ orgId });
    } catch (e) {
      toast.error("Failed to cancel subscription");
    }
  };

  // Reactivate with confirm dialog
  if (cancellation?.isCancelled) {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button
            variant={variant}
            disabled={loading}
            title="Reactivate Subscription"
          >
            {loading ? "Working…" : "Reactivate Subscription"}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Reactivation</DialogTitle>
          </DialogHeader>
          <DialogBody>
            This will remove the scheduled cancellation and your subscription
            will continue beyond the current billing period. Are you sure you
            want to reactivate?
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Keep Scheduled Cancellation</Button>
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
          <DialogTitle>Confirm Cancellation</DialogTitle>
        </DialogHeader>
        <DialogBody>
          This will cancel your subscription at the end of the current billing
          period. You will retain access until then. Are you sure you want to
          continue?
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
