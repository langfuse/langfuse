import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { api, reportNonTrpcError } from "@/src/utils/api";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface DeleteSpendAlertDialogProps {
  orgId: string;
  alertId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function DeleteSpendAlertDialog({
  orgId,
  alertId,
  open,
  onOpenChange,
  onSuccess,
}: DeleteSpendAlertDialogProps) {
  const t = useTranslations("settingsEnterprise.billing");
  const [isDeleting, setIsDeleting] = useState(false);
  const capture = usePostHogClientCapture();

  const deleteMutation = api.spendAlerts.deleteSpendAlert.useMutation();

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteMutation.mutateAsync({
        orgId,
        id: alertId,
      });
      capture("spend_alert:deleted", {
        orgId,
        alertId,
      });
      toast.success(t("spendAlerts.deleted"));
      onSuccess();
    } catch (error) {
      reportNonTrpcError(error, "billing");
      toast.error(t("spendAlerts.deleteFailed"));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("spendAlerts.deleteTitle")}</DialogTitle>
          <DialogDescription>
            {t("spendAlerts.deleteDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={isDeleting}
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting
              ? t("spendAlerts.deleting")
              : t("spendAlerts.deleteAlert")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
