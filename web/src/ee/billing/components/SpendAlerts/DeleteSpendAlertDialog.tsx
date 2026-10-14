import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/app/design-system/legacy-primitives/dialog";
import { Button } from "@/src/app/design-system/legacy-primitives/button";
import { api, reportNonTrpcError } from "@/src/app/utils/api";
import { usePostHogClientCapture } from "@/src/analytics/internal/posthog";
import { showSuccessToast, showToast } from "@/src/app/shell/notifications";
import { classifyTrpcToastError } from "@/src/app/utils/trpcErrorClassification";

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
      showSuccessToast({
        operation: "spend_alert.delete",
        title: "Spend alert deleted successfully",
        description: "",
      });
      onSuccess();
    } catch (error) {
      reportNonTrpcError(error, "billing");
      showToast({
        type: "ERROR",
        title: "Failed to delete spend alert. Please try again.",
        analytics: classifyTrpcToastError(error, "spend_alert.delete"),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Spend Alert</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this spend alert? This action cannot
            be undone and you will no longer receive notifications for this
            threshold.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={isDeleting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete Alert"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
