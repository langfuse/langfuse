import { useState } from "react";
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
import { api } from "@/src/utils/api";
import { toast } from "sonner";
import { nanoid } from "nanoid";

export const StripeKeepPlanButton = ({
  orgId,
  stripeProductId,
  onProcessing,
  processing,
}: {
  orgId: string | undefined;
  stripeProductId: string;
  onProcessing: (id: string | null) => void;
  processing: boolean;
}) => {
  const [_opId, setOpId] = useState<string | null>(null);

  const clearSchedule = api.cloudBilling.clearPlanSwitchSchedule.useMutation({
    onSuccess: () => {
      toast.success("Kept current plan");
      onProcessing(null);
      setOpId(null);
      setTimeout(() => window.location.reload(), 500);
    },
    onError: () => {
      onProcessing(null);
      setOpId(null);
      toast.error("Failed to keep current plan");
    },
  });

  if (!orgId) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="w-full" variant="default">
          Keep Plan
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg">
            Confirm Keeping Current Plan
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="text-sm">
          <p>
            You have a scheduled plan change on your current subscription.
            Keeping your current plan will remove that schedule and you will
            remain on your existing plan.
          </p>
          <p>
            Your features and pricing will stay as-is; usage continues to be
            billed under your current plan. Do you want to keep your current
            plan and cancel the scheduled change?
          </p>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Go Back</Button>
          </DialogClose>
          <Button
            variant="default"
            onClick={() => {
              onProcessing(stripeProductId);
              // idempotency key for mutation operations with the stripe api
              let opId = _opId;
              if (!opId) {
                opId = nanoid();
                setOpId(opId);
              }
              clearSchedule.mutate({ orgId, opId });
            }}
            disabled={processing}
          >
            {processing ? "Keeping…" : "Confirm Keep Plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
