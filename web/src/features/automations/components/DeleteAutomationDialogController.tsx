import { showSuccessToast } from "@/src/features/notifications";
import type * as React from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { api } from "@/src/utils/api";
import { useHasProjectAccess } from "@/src/features/rbac";
import { DeleteAutomationDialog } from "./DeleteAutomationDialog";

type DeleteAutomationDialogControllerProps = {
  projectId: string;
  automationId: string;
  onSuccess?: () => void;
  children: (control: {
    disabled: { reason: string } | undefined;
    openDialog: () => void;
  }) => React.ReactNode;
};

export const DeleteAutomationDialogController = ({
  projectId,
  automationId,
  onSuccess,
  children,
}: DeleteAutomationDialogControllerProps) => {
  const utils = api.useUtils();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "automations:CUD",
  });

  const deleteAutomationMutation = api.automations.deleteAutomation.useMutation(
    {
      onSuccess: () => {
        showSuccessToast({
          title: "Automation deleted",
          description: "The automation has been deleted successfully.",
        });

        onSuccess?.();

        utils.automations.invalidate();
      },
    },
  );

  const disabled = hasAccess
    ? undefined
    : { reason: "You don't have permission to delete this automation." };

  const handleDelete = async (closeDialog: () => void) => {
    try {
      await deleteAutomationMutation.mutateAsync({
        projectId,
        automationId,
      });
      closeDialog();
    } catch {
      // The tRPC error handler owns mutation failures; keep the dialog open.
    }
  };

  return (
    <DialogController
      renderDialog={({ closeDialog }) => (
        <DeleteAutomationDialog
          isPending={deleteAutomationMutation.isPending}
          onConfirm={() => handleDelete(closeDialog)}
        />
      )}
    >
      {({ openDialog }) =>
        children({
          disabled,
          openDialog: () => {
            if (!hasAccess) return;
            openDialog();
          },
        })
      }
    </DialogController>
  );
};
