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
                We will end your current subscription now and start a new one
                immediately.
              </p>
              <p>
                You will receive an invoice today that includes (1) the base fee
                for the new plan for a fresh billing period starting today and
                (2) your base-fee and usage to date on the previous
                subscription.
              </p>
              <p>
                By confirming, you accept the immediate invoice and plan
                activation starting now.
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
                Example: if your plan is $199/month and you upgrade halfway
                through the month to a $499/month plan, the prorated charge is
                roughly $99.5 + $249.5 (plus taxes). Exact amounts depend on
                timing and tax.
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
                Usage continues to be billed under your current plan until the
                switch. By confirming, you schedule the change at period end and
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
              // idempotency key for mutation operations with the stripe api
              let opId = _opId;
              if (!opId) {
                opId = nanoid();
                setOpId(opId);
              }
              mutChangePlan.mutate({ orgId, stripeProductId, opId });
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
