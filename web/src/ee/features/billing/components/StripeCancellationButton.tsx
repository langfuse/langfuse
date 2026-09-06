/* eslint-disable @repo/no-style-props, @repo/no-abstracted-overlay-trigger, @repo/no-null-render */
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
import { useTranslations } from "next-intl";

export const StripeCancellationButton = ({
  orgId,
  variant,
  className,
}: {
  orgId: string | undefined;
  variant: "secondary" | "default";
  className?: string;
}) => {
  const t = useTranslations("settingsEnterprise.billing");
  const { cancellation } = useBillingInformation();
  const [loading, setLoading] = useState(false);
  const [_opId, setOpId] = useState<string | null>(null);

  const cancelMutation = api.cloudBilling.cancelStripeSubscription.useMutation({
    onSuccess: () => {
      toast.success(t("cancellation.scheduled"));
      setLoading(false);
      setOpId(null);
      setTimeout(() => window.location.reload(), 500);
    },
    onError: () => {
      setLoading(false);
      setOpId(null);
      toast.error(t("cancellation.cancelFailed"));
    },
  });

  const reactivateMutation =
    api.cloudBilling.reactivateStripeSubscription.useMutation({
      onSuccess: () => {
        toast.success(t("cancellation.reactivated"));
        setLoading(false);
        setOpId(null);
        setTimeout(() => window.location.reload(), 500);
      },
      onError: () => {
        setLoading(false);
        setOpId(null);
        toast.error(t("cancellation.reactivateFailed"));
      },
    });

  if (!orgId) return null;

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
    } catch (_e) {
      toast.error(t("cancellation.reactivateFailed"));
    }
  };

  const onCancel = async () => {
    try {
      setLoading(true);
      // idempotency key for mutation operations with the stripe api
      let opId = _opId;
      if (!opId) {
        opId = nanoid();
        setOpId(opId);
      }
      await cancelMutation.mutateAsync({ orgId, opId });
    } catch (_e) {
      toast.error(t("cancellation.cancelFailed"));
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
            title={t("cancellation.reactivate")}
            className={className}
          >
            {loading ? t("cancellation.working") : t("cancellation.reactivate")}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg">
              {t("cancellation.reactivateTitle")}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="text-sm">
            <p>{t("cancellation.reactivateDescription")}</p>
            <p>{t("cancellation.reactivateConfirmation")}</p>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">{t("common.cancel")}</Button>
            </DialogClose>
            <Button variant="default" onClick={onReactivate} disabled={loading}>
              {loading
                ? t("cancellation.reactivating")
                : t("cancellation.confirmReactivation")}
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
          title={t("cancellation.cancelSubscription")}
        >
          {t("cancellation.cancelSubscription")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-lg">
            {t("cancellation.cancelTitle")}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="text-sm">
          <p>{t("cancellation.cancelDescription")}</p>
          <p>{t("cancellation.cancelConfirmation")}</p>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">
              {t("cancellation.keepSubscription")}
            </Button>
          </DialogClose>
          <Button variant="destructive" onClick={onCancel} disabled={loading}>
            {loading
              ? t("cancellation.cancelling")
              : t("cancellation.confirmCancellation")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
