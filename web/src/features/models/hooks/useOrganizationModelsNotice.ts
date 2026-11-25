import { modelsSettingsHref } from "@/src/features/models/modelOwner";
import { useProject } from "@/src/features/projects/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";

/** Props for `OrganizationModelsNotice` on a project page, once its organization is known. */
export function useOrganizationModelsNotice(projectId: string | null) {
  const { organization } = useProject(projectId);
  const canManage = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "organizationModels:read",
  });
  if (!organization) return null;

  return {
    organizationName: organization.name,
    manageHref: canManage
      ? modelsSettingsHref({
          scope: "organization",
          organizationId: organization.id,
        })
      : undefined,
  };
}
