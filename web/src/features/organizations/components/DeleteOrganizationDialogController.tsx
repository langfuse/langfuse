import { showSuccessToast } from "@/src/features/notifications";
import { type ReactNode, useState } from "react";

import { Dialog, DialogContent } from "@/src/components/ui/dialog";
import { DeleteOrganizationDialogContent } from "@/src/features/organizations/components/DeleteOrganizationDialogContent";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac";
import { api, reportNonTrpcError } from "@/src/utils/api";
import { env } from "@/src/env.mjs";

type DeleteOrganizationDialogControllerProps = {
  children: (control: {
    disabled: { reason: string } | undefined;
    openDialog: () => void;
  }) => ReactNode;
};

export function DeleteOrganizationDialogController({
  children,
}: DeleteOrganizationDialogControllerProps) {
  const [open, setOpen] = useState(false);
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

  const openDialog = () => {
    if (!hasAccess) return;
    setOpen(true);
  };

  const onSubmit = async () => {
    if (!organization || hasProjects) return;
    try {
      await deleteOrganization.mutateAsync({
        orgId: organization.id,
      });
      capture("organization_settings:delete_organization");
      showSuccessToast({
        title: "Organization Deleted",
        description: "The organization has been successfully deleted.",
      });
      await new Promise((resolve) => setTimeout(resolve, 5000));
      window.location.href = env.NEXT_PUBLIC_BASE_PATH ?? "/";
    } catch (error) {
      // tRPC failures were already classified + toasted by the react-query
      // default onError; only report failures of the post-success work here.
      reportNonTrpcError(error, "organizations");
    }
  };

  return (
    <>
      {children({ disabled, openDialog })}
      <Dialog open={hasAccess && open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DeleteOrganizationDialogContent
            confirmMessage={confirmMessage}
            hasProjects={hasProjects}
            isPending={deleteOrganization.isPending}
            onConfirm={onSubmit}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
