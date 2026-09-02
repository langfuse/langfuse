import { type ReactNode } from "react";

import {
  DialogController,
  type DialogTrigger,
} from "@/src/components/ui/dialog";
import { env } from "@/src/env.mjs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api, reportNonTrpcError } from "@/src/utils/api";
import { DeleteProjectDialog } from "./DeleteProjectDialog";

type DeleteProjectDialogControllerProps = {
  children: (control: {
    hasAccess: boolean;
    Trigger: typeof DialogTrigger;
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
      closeOnInteractionOutside={false}
      size="default"
      renderContent={() => (
        <DeleteProjectDialog
          confirmMessage={confirmMessage}
          isPending={deleteProject.isPending}
          onSubmit={handleDelete}
        />
      )}
    >
      {({ Trigger }) => children({ hasAccess, Trigger })}
    </DialogController>
  );
}
