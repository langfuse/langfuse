import type * as React from "react";

import { PopoverController } from "@/src/components/ui/popover";
import { api } from "@/src/utils/api";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { DeleteAutomationPopoverContent } from "./DeleteAutomationPopoverContent";

type DeleteAutomationPopoverControllerProps = {
  projectId: string;
  automationId: string;
  onSuccess?: () => void;
  children: React.ComponentProps<typeof PopoverController>["children"];
};

export const DeleteAutomationPopoverController = ({
  projectId,
  automationId,
  onSuccess,
  children,
}: DeleteAutomationPopoverControllerProps) => {
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

  const handleDelete = async (closePopover: () => void) => {
    try {
      await deleteAutomationMutation.mutateAsync({
        projectId,
        automationId,
      });
      closePopover();
    } catch {
      // The tRPC error handler owns mutation failures; keep the popover open.
    }
  };

  return (
    <PopoverController
      align="center"
      contentClassName=""
      disabled={!hasAccess}
      modal={false}
      renderContent={({ closePopover }) => (
        <DeleteAutomationPopoverContent
          isPending={deleteAutomationMutation.isPending}
          onConfirm={() => {
            handleDelete(closePopover);
          }}
        />
      )}
    >
      {children}
    </PopoverController>
  );
};
