/* eslint-disable @repo/no-abstracted-overlay-trigger, @repo/no-null-render */
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
import { useTranslations } from "next-intl";

export const StripeSwitchPlanButton = ({
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
}) => {
  const t = useTranslations("settingsEnterprise.billing");
  const [_opId, setOpId] = useState<string | null>(null);

  const mutChangePlan =
    api.cloudBilling.changeStripeSubscriptionProduct.useMutation({
      onSuccess: () => {
        toast.success(t("changePlan.changed"));
        onProcessing(null);
        setOpId(null);
        setTimeout(() => window.location.reload(), 500);
      },
      onError: () => {
        onProcessing(null);
        setOpId(null);
        toast.error(t("changePlan.failed"));
      },
    });

  if (!orgId) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="w-full">{t("common.changePlan")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg">
            {t("changePlan.confirmTitle", {
              currentPlan: planLabels[currentPlan ?? "cloud:hobby"],
              newPlan: newPlanTitle ?? "",
            })}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="text-sm">
          {isLegacySubscription ? (
            <>
              <p>{t("changePlan.legacyStart")}</p>
              <p>{t("changePlan.legacyInvoice")}</p>
              <p>{t("changePlan.legacyConfirm")}</p>
            </>
          ) : isUpgrade ? (
            <>
              <p>{t("changePlan.upgradeCharge")}</p>
              <p>{t("changePlan.upgradeExample")}</p>
              <p>{t("changePlan.upgradeConfirm")}</p>
            </>
          ) : (
            <>
              <p>{t("changePlan.downgradeCharge")}</p>
              <p>{t("changePlan.downgradeConfirm")}</p>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">{t("common.cancel")}</Button>
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
          >
            {t("common.confirm")}
          </ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
