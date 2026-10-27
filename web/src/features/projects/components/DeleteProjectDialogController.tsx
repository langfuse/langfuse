import { AlertTriangle } from "@langfuse/icons";
import { type ReactNode } from "react";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { env } from "@/src/env.mjs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api, reportNonTrpcError } from "@/src/utils/api";
import { DeleteProjectDialog } from "./DeleteProjectDialog";

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
  const deletionImpact = api.projects.deletionImpact.useQuery(
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
      renderDialog={() => (
        <DeleteProjectDialog
          confirmMessage={confirmMessage}
          isPending={deleteProject.isPending}
          onSubmit={handleDelete}
        >
          {deletionImpact.data?.isGatewayIngestionProject && organization ? (
            <Alert variant="warning" icon={AlertTriangle}>
              <Alert.Title>AI Gateway ingestion project</Alert.Title>
              <Alert.Description>
                <p>
                  This project is the AI Gateway ingestion project of your
                  organization. Deleting it sets the gateway ingestion mode to
                  None: gateway requests keep working but are not traced in
                  Langfuse until you select a new ingestion project.
                </p>
                <TextLink
                  path={`/organization/${organization.id}/settings/ai-gateway`}
                  value="Open AI Gateway settings"
                />
              </Alert.Description>
            </Alert>
          ) : null}
        </DeleteProjectDialog>
      )}
    >
      {({ openDialog }) =>
        children({
          hasAccess: hasAccess && !deletionImpact.isLoading,
          openDialog,
        })
      }
    </DialogController>
  );
}
