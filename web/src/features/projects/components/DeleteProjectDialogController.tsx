import { ExternalLink } from "lucide-react";
import { type ReactNode } from "react";
import { useRouter } from "next/router";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { env } from "@/src/env.mjs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useQueryProject } from "../hooks";
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
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const { project, organization } = useQueryProject();
  const confirmMessage = `${organization?.name}/${project?.name}`
    .replaceAll(" ", "-")
    .toLowerCase();
  const hasAccess = useHasProjectAccess({
    projectId: project?.id,
    scope: "project:delete",
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
        if (
          deletionProtection.data?.isGatewayIngestionProject &&
          organization
        ) {
          return (
            <Dialog
              title="Project cannot be deleted"
              text="This project is used as the AI Gateway ingestion project. Select another ingestion project before deleting it."
              actions={[
                {
                  label: "Open AI Gateway settings",
                  icon: ExternalLink,
                  onClick: () =>
                    router.push(
                      `/organization/${organization.id}/settings/ai-gateway`,
                    ),
                },
              ]}
            />
          );
        }

        return (
          <DeleteProjectDialog
            confirmMessage={confirmMessage}
            isPending={deleteProject.isPending}
            onSubmit={handleDelete}
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
