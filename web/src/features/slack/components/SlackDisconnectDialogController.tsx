import React from "react";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { showSuccessToast, showErrorToast } from "@/src/features/notifications";
import { api, reportTrpcErrorWithoutToast } from "@/src/utils/api";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";
import { SlackDisconnectDialog } from "@/src/features/slack/components/SlackDisconnectDialog/SlackDisconnectDialog";

interface SlackDisconnectDialogControllerProps {
  /** Project ID for the Slack integration */
  projectId: string;
  /** Callback when disconnection is successful */
  onSuccess?: () => void;
  /** Callback when disconnection fails */
  onError?: (error: Error) => void;
  children: (control: {
    isPending: boolean;
    openDialog: () => void;
  }) => React.ReactNode;
}

/**
 * SlackDisconnectDialogController asks for confirmation, then disconnects the
 * project's Slack integration. The caller renders the trigger.
 */
export const SlackDisconnectDialogController = ({
  projectId,
  onSuccess,
  onError,
  children,
}: SlackDisconnectDialogControllerProps) => {
  const disconnectMutation = api.slack.disconnect.useMutation({
    onSuccess: () => {
      showSuccessToast({
        operation: "slack.disconnect",
        title: "Slack Disconnected",
        description: "Successfully disconnected from your Slack workspace.",
      });

      onSuccess?.();
    },
    onError: (error) => {
      const errorMessage = error.message || "Failed to disconnect from Slack";

      showErrorToast(
        "Disconnection Failed",
        errorMessage,
        classifyTrpcToastError(error, "slack.disconnect"),
      );

      onError?.(new Error(errorMessage));
    },
  });

  const handleDisconnect = async (closeDialog: () => void) => {
    if (disconnectMutation.isPending) return;

    try {
      await disconnectMutation.mutateAsync({ projectId });
      closeDialog();
    } catch (error) {
      // The mutation's local onError owns the UX; this owns classification + capture.
      reportTrpcErrorWithoutToast(error, "slack");
    }
  };

  return (
    <DialogController
      renderDialog={({ closeDialog }) => {
        const handleConfirm = () => handleDisconnect(closeDialog);
        return (
          <SlackDisconnectDialog
            isPending={disconnectMutation.isPending}
            onConfirm={handleConfirm}
          />
        );
      }}
    >
      {({ openDialog }) => {
        // Called without arguments so a click event is never stored as dialog state.
        const handleOpenDialog = () => openDialog();
        return children({
          isPending: disconnectMutation.isPending,
          openDialog: handleOpenDialog,
        });
      }}
    </DialogController>
  );
};
