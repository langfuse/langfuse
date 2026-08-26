import { useState } from "react";

import { Button } from "@/src/components/ui/button";
import { api, reportNonTrpcError } from "@/src/utils/api";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { env } from "@/src/env.mjs";
import { DeleteOrganizationDialog } from "./DeleteOrganizationDialog";

export function DeleteOrganizationButton() {
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
  const [open, setOpen] = useState(false);

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
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Delay for 5 seconds
      window.location.href = env.NEXT_PUBLIC_BASE_PATH ?? "/"; // Browser reload to refresh jwt
    } catch (error) {
      // tRPC failures were already classified + toasted by the react-query
      // default onError; only report failures of the post-success work here.
      reportNonTrpcError(error, "organizations");
    }
  };

  return (
    <>
      <Button
        variant="destructive-secondary"
        disabled={!hasAccess}
        onClick={() => setOpen(true)}
      >
        Delete Organization
      </Button>
      <DeleteOrganizationDialog
        open={open}
        onOpenChange={setOpen}
        confirmMessage={confirmMessage}
        hasProjects={hasProjects}
        isPending={deleteOrganization.isPending}
        onConfirm={onSubmit}
      />
    </>
  );
}
