import { showSuccessToast } from "@/src/features/notifications";
import { type ReactNode, useState } from "react";

import { Dialog } from "@/src/components/ui/dialog";
import { TransferProjectDialogContent } from "@/src/features/projects/components/TransferProjectDialogContent";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import {
  hasOrganizationAccess,
  useHasOrganizationAccess,
} from "@/src/features/rbac";
import { api } from "@/src/utils/api";
import { useSession } from "next-auth/react";

type TransferProjectDialogControllerProps = {
  project: {
    id: string;
    name: string;
  };
  organization: {
    id: string;
    name: string;
  };
  children: (control: {
    disabled: { reason: string } | undefined;
    openDialog: () => void;
  }) => ReactNode;
};

export function TransferProjectDialogController({
  project,
  organization,
  children,
}: TransferProjectDialogControllerProps) {
  const [open, setOpen] = useState(false);
  const capture = usePostHogClientCapture();
  const session = useSession();
  const hasAccess = useHasOrganizationAccess({
    organizationId: organization.id,
    scope: "projects:transfer_org",
  });
  const organizationsToTransferTo = (session.data?.user?.organizations ?? [])
    .filter((org) =>
      hasOrganizationAccess({
        session: session.data,
        organizationId: org.id,
        scope: "projects:transfer_org",
      }),
    )
    .filter((org) => org.id !== organization.id);

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

  const disabled = hasAccess
    ? undefined
    : { reason: "You don't have permission to transfer this project." };

  const openDialog = () => {
    if (!hasAccess) return;

    setOpen(true);
  };

  const onConfirm = (organizationId: string) => {
    capture("project_settings:project_delete");
    transferProject.mutate({
      projectId: project.id,
      targetOrgId: organizationId,
    });
  };

  return (
    <>
      {children({ disabled, openDialog })}
      <Dialog open={hasAccess && open} onOpenChange={setOpen}>
        <TransferProjectDialogContent
          projectName={project.name}
          organizationName={organization.name}
          organizations={organizationsToTransferTo}
          isPending={transferProject.isPending}
          onConfirm={onConfirm}
        />
      </Dialog>
    </>
  );
}
