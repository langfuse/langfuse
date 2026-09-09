import { type ReactNode, useState } from "react";
import { useRouter } from "next/router";

import { env } from "@/src/env.mjs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useHasProjectAccess } from "@/src/features/rbac";
import { api, reportNonTrpcError } from "@/src/utils/api";
import { DeleteProjectDialog } from "./DeleteProjectDialog";

type DeleteProjectDialogControllerProps = {
  children: (control: { hasAccess: boolean }) => ReactNode;
};

export function DeleteProjectDialogController({
  children,
}: DeleteProjectDialogControllerProps) {
  const [isOpen, setIsOpen] = useState(false);
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

  const trigger = children({
    hasAccess: hasAccess && !deletionProtection.isLoading,
  });

  return deletionProtection.data?.isGatewayIngestionProject && organization ? (
    <DeleteProjectDialog
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={trigger}
      blocked
      onOpenGatewaySettings={() =>
        router.push(`/organization/${organization.id}/settings/ai-gateway`)
      }
    />
  ) : (
    <DeleteProjectDialog
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={trigger}
      confirmMessage={confirmMessage}
      isPending={deleteProject.isPending}
      onSubmit={handleDelete}
    />
  );
}
