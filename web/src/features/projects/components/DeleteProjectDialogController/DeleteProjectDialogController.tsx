import { type ReactNode } from "react";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { env } from "@/src/env.mjs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api, reportNonTrpcError } from "@/src/utils/api";
import { DeleteProjectDialog } from "@/src/features/projects/components/DeleteProjectDialogController/components/DeleteProjectDialog/DeleteProjectDialog";

type DeleteProjectDialogControllerProps = {
  children: (control: {
    hasAccess: boolean;
    openDialog: () => void;
  }) => ReactNode;
};

export function DeleteProjectDialogController({
  children,
}: DeleteProjectDialogControllerProps) {
  const capture = usePostHogClientCapture();
  const { project, organization } = useQueryProject();
  const confirmMessage = `${organization?.name}/${project?.name}`
    .replaceAll(" ", "-")
    .toLowerCase();
  const hasAccess = useHasProjectAccess({
    projectId: project?.id,
    scope: "project:delete",
  });
  const canManageGateway = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "gateway:manage",
  });
  const deletionProtection = api.projects.deletionProtection.useQuery(
    { projectId: project?.id ?? "" },
    { enabled: Boolean(project?.id) && hasAccess },
  );
  const deleteProject = api.projects.delete.useMutation();

  const handleDelete = () => {
    if (!project) return;

    capture("project_settings:project_delete");
    deleteProject
      .mutateAsync({
        projectId: project.id,
      })
      .then(() => {
        window.location.href = env.NEXT_PUBLIC_BASE_PATH ?? "/";
      })
      .catch((error) => reportNonTrpcError(error, "projects"));
  };

  return (
    <DialogController
      renderDialog={() => {
        const isGatewayIngestionProject =
          deletionProtection.data?.isGatewayIngestionProject === true;
        if (isGatewayIngestionProject && !canManageGateway) {
          return (
            <Dialog
              title="Project cannot be deleted"
              text="This project receives the organization's AI Gateway traces. Only members who can manage the AI Gateway can delete it."
            />
          );
        }

        return (
          <DeleteProjectDialog
            confirmMessage={confirmMessage}
            isPending={deleteProject.isPending}
            onSubmit={handleDelete}
            gatewayOrganizationName={
              isGatewayIngestionProject ? organization?.name : undefined
            }
          />
        );
      }}
    >
      {({ openDialog }) =>
        children({
          hasAccess: hasAccess && !deletionProtection.isLoading,
          openDialog,
        })
      }
    </DialogController>
  );
}
