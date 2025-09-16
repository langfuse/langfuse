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
import { ActionButton } from "@/src/components/ActionButton";
import { planLabels } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { toast } from "sonner";
import { nanoid } from "nanoid";

export const StripeSwitchPlanButton = ({
  className,
  orgId,
  currentPlan,
  newPlanTitle,
  isLegacySubscription,
  isUpgrade,
  stripeProductId,
  onProcessing,
  processing,
}: {
  orgId: string | undefined;
  currentPlan: keyof typeof planLabels | undefined;
  newPlanTitle: string | undefined;
  isLegacySubscription: boolean;
  isUpgrade: boolean;
  stripeProductId: string;
  onProcessing: (id: string | null) => void;
  processing: boolean;
  className?: string;
}) => {
  const [_opId, setOpId] = useState<string | null>(null);

  const mutChangePlan =
    api.cloudBilling.changeStripeSubscriptionProduct.useMutation({
      onSuccess: () => {
        toast.success("Plan changed successfully");
        onProcessing(null);
        setOpId(null);
        setTimeout(() => window.location.reload(), 500);
      },
      onError: () => {
        onProcessing(null);
        setOpId(null);
        toast.error("Failed to change plan");
      },
    });

  if (!orgId) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="w-full">Change plan</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg">
            Confirm Your Change: {planLabels[currentPlan ?? "cloud:hobby"]} →{" "}
            {newPlanTitle}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="text-sm">
          {isLegacySubscription ? (
            <>
              <p>
                We will charge today for usage to date. Your new plan starts
                immediately and your billing period resets today.
              </p>
              <p>
                By confirming, you accept today’s charge and immediate
                activation.
              </p>
            </>
          ) : isUpgrade ? (
            <>
              <p>
                You will be charged a prorated base fee today for the remainder
                of this billing period. Features update immediately; usage-based
                charges continue for the rest of the billing period.
              </p>
              <p>
                By confirming, you accept the prorated charge and immediate plan
                change.
              </p>
            </>
          ) : (
            <>
              <p>
                No charge is made today. You stay on your current plan until the
                end of this billing period, then we switch you to the new plan.
                You can switch back anytime.
              </p>
              <p>
                By confirming, you schedule the change at period end and
                understand features will adjust at that time.
              </p>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <ActionButton
            onClick={() => {
              onProcessing(stripeProductId);
              const newOpId = nanoid();
              setOpId(newOpId);
              mutChangePlan.mutate({ orgId, stripeProductId, opId: newOpId });
            }}
            loading={processing}
            className={className}
          >
            Confirm
          </ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
