import type * as React from "react";
import { useState } from "react";

import { api } from "@/src/utils/api";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { DeleteAutomationDialog } from "./DeleteAutomationDialog";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("remainderUi.automations.deleteDialog");
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
          title: t("successTitle"),
          description: t("successDescription"),
        });

        onSuccess?.();

        utils.automations.invalidate();
      },
    },
  );

  const disabled = hasAccess ? undefined : { reason: t("permission") };

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
