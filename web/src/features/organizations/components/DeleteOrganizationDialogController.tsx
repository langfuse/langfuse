import { type ReactNode } from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { DeleteOrganizationDialog } from "@/src/features/organizations/components/DeleteOrganizationDialog";
import { useDeleteOrganization } from "@/src/features/organizations/useDeleteOrganization";

type DeleteOrganizationDialogControllerProps = {
  children: (control: {
    disabled: { reason: string } | undefined;
    openDialog: () => void;
  }) => ReactNode;
};

export function DeleteOrganizationDialogController({
  children,
}: DeleteOrganizationDialogControllerProps) {
  const deleteOrganization = useDeleteOrganization();

  return (
    <DialogController
      onBeforeClose={() => !deleteOrganization.isSubmitting}
      onDismiss={deleteOrganization.onDismiss}
      renderDialog={({ closeDialog }) => (
        <DeleteOrganizationDialog
          confirmMessage={deleteOrganization.confirmMessage}
          deleteDisabledReason={deleteOrganization.disabled?.reason}
          inlineError={deleteOrganization.inlineError}
          isSubmitting={deleteOrganization.isSubmitting}
          onConfirm={() => deleteOrganization.onConfirm(closeDialog)}
          status={deleteOrganization.status}
        />
      )}
    >
      {({ openDialog }) =>
        children({
          disabled: deleteOrganization.disabled,
          openDialog: () => deleteOrganization.open(openDialog),
        })
      }
    </DialogController>
  );
}
