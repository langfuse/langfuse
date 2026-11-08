import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { type ReactNode } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { DeleteOrganizationDialog } from "@/src/features/organizations/components/DeleteOrganizationDialog";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { api, reportNonTrpcError } from "@/src/utils/api";

type DeleteOrganizationDialogControllerProps = {
  children: (control: {
    disabled: { reason: string } | undefined;
    openDialog: () => void;
  }) => ReactNode;
};

export function DeleteOrganizationDialogController({
  children,
}: DeleteOrganizationDialogControllerProps) {
  const router = useRouter();
  const session = useSession();
  const capture = usePostHogClientCapture();
  const organization = useQueryOrganization();
  const confirmMessage =
    organization?.name.replaceAll(" ", "-").toLowerCase() ?? "organization";
  const hasAccess = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "organization:delete",
  });
  const deleteOrganization = api.organizations.delete.useMutation();
  const hasProjects = !!organization && organization.projects.length > 0;

  const disabled = hasAccess
    ? undefined
    : { reason: "You don't have permission to delete this organization." };

  const onSubmit = async (closeDialog: () => void) => {
    if (!organization || hasProjects) return;
    try {
      await deleteOrganization.mutateAsync({
        orgId: organization.id,
      });
      capture("organization_settings:delete_organization");
      closeDialog();
      showSuccessToast({
        operation: "organization.delete",
        title: "Organization Deleted",
        description: "The organization has been successfully deleted.",
      });
      // Refresh the session first so the landing page no longer lists the deleted organization.
      await session.update();
      await router.push("/");
    } catch (error) {
      // tRPC failures were already classified + toasted by the react-query
      // default onError; only report failures of the post-success work here.
      reportNonTrpcError(error, "organizations");
    }
  };

  return (
    <DialogController
      renderDialog={({ closeDialog }) => (
        <DeleteOrganizationDialog
          confirmMessage={confirmMessage}
          hasProjects={hasProjects}
          isPending={deleteOrganization.isPending}
          onConfirm={() => onSubmit(closeDialog)}
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
}
