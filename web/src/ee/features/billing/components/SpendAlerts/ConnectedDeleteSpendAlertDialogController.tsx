import { type ComponentProps } from "react";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { api, reportNonTrpcError } from "@/src/utils/api";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { showSuccessToast, showToast } from "@/src/features/notifications";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";

export function ConnectedDeleteSpendAlertDialogController({
  orgId,
  onSuccess,
  children,
}: {
  orgId: string;
  onSuccess: () => void;
  children: ComponentProps<
    typeof ConfirmationDialogController<string>
  >["children"];
}) {
  const capture = usePostHogClientCapture();

  const deleteMutation = api.spendAlerts.deleteSpendAlert.useMutation();

  const handleDelete = async (alertId: string) => {
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
      throw error;
    }
  };

  return (
    <ConfirmationDialogController<string>
      title="Delete Spend Alert"
      text="Are you sure you want to delete this spend alert? This action cannot be undone and you will no longer receive notifications for this threshold."
      confirmLabel="Delete Alert"
      variant="destructive"
      loading={deleteMutation.isPending}
      error={deleteMutation.error?.message}
      onAfterDismiss={deleteMutation.reset}
      onConfirm={handleDelete}
    >
      {children}
    </ConfirmationDialogController>
  );
}
