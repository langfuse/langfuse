import { showSuccessToast } from "@/src/features/notifications";
import type * as React from "react";
import { useState } from "react";

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
  const [open, setOpen] = useState(false);
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

  const openDialog = () => {
    if (!hasAccess) return;

    setOpen(true);
  };

  const handleDelete = async () => {
    try {
      await deleteAutomationMutation.mutateAsync({
        projectId,
        automationId,
      });
      setOpen(false);
    } catch {
      // The tRPC error handler owns mutation failures; keep the dialog open.
    }
  };

  return (
    <>
      {children({ disabled, openDialog })}
      <DeleteAutomationDialog
        open={hasAccess && open}
        onOpenChange={setOpen}
        isPending={deleteAutomationMutation.isPending}
        onConfirm={handleDelete}
      />
    </>
  );
};
