import { Button } from "@/src/components/ui/button";
import { TransferProjectDialog } from "@/src/features/projects/components/TransferProjectDialog";
import { api } from "@/src/utils/api";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  hasOrganizationAccess,
  useHasOrganizationAccess,
} from "@/src/features/rbac/utils/checkOrganizationAccess";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useSession } from "next-auth/react";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useState } from "react";

export function TransferProjectButton() {
  const [open, setOpen] = useState(false);
  const capture = usePostHogClientCapture();
  const session = useSession();
  const { project, organization } = useQueryProject();
  const hasAccess = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "projects:transfer_org",
  });
  const allOrgs = session.data?.user?.organizations ?? [];
  const organizationsToTransferTo =
    allOrgs.filter((org) =>
      hasOrganizationAccess({
        session: session.data,
        organizationId: org.id,
        scope: "projects:transfer_org",
      }),
    ) ?? [];

  const transferProject = api.projects.transfer.useMutation({
    onSuccess: async () => {
      showSuccessToast({
        title: "Project transferred",
        description:
          "The project is successfully transferred to the new organization. Redirecting...",
      });
      await new Promise((resolve) => setTimeout(resolve, 5000));
      session.update();
      // Existing hard navigation is accepted during the Next.js 16.3 migration.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/";
    },
  });

  const onConfirm = (organizationId: string) => {
    if (!project) return;
    capture("project_settings:project_delete");
    transferProject.mutate({
      projectId: project.id,
      targetOrgId: organizationId,
    });
  };

  return (
    <>
      <Button
        variant="destructive-secondary"
        disabled={!hasAccess}
        onClick={() => setOpen(true)}
      >
        Transfer Project
      </Button>
      {project && organization ? (
        <TransferProjectDialog
          open={open}
          onOpenChange={setOpen}
          projectName={project.name}
          organizationName={organization.name}
          organizations={organizationsToTransferTo.filter(
            (org) => org.id !== organization.id,
          )}
          isPending={transferProject.isPending}
          onConfirm={onConfirm}
        />
      ) : null}
    </>
  );
}
