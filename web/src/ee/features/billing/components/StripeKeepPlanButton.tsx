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
import { api } from "@/src/utils/api";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("settingsEnterprise.billing.keepPlan");
  const [_opId, setOpId] = useState<string | null>(null);

  const clearSchedule = api.cloudBilling.clearPlanSwitchSchedule.useMutation({
    onSuccess: () => {
      toast.success(t("kept"));
      onProcessing(null);
      setOpId(null);
      setTimeout(() => window.location.reload(), 500);
    },
    onError: () => {
      onProcessing(null);
      setOpId(null);
      toast.error(t("failed"));
    },
  });

  if (!orgId) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="w-full" variant="default">
          {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg">{t("title")}</DialogTitle>
        </DialogHeader>
        <DialogBody className="text-sm">
          <p>{t("description")}</p>
          <p>{t("confirmation")}</p>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">{t("goBack")}</Button>
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
            {processing ? t("keeping") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
