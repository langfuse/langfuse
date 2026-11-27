import type { ModelScope } from "@langfuse/shared";

import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

/** Where model definitions are managed: a project's or an organization's settings. */
export type ModelOwner =
  | { scope: "project"; projectId: string }
  | { scope: "organization"; organizationId: string };

const editableScopeByOwner = {
  project: "PROJECT",
  organization: "ORGANIZATION",
} as const satisfies Record<ModelOwner["scope"], ModelScope>;

/** Each owner edits only its own definitions; it clones the others to override them. */
export const isEditableIn = (
  ownerScope: ModelOwner["scope"],
  scope: ModelScope,
) => editableScopeByOwner[ownerScope] === scope;

export const cloneLabelFor = (owner: ModelOwner) =>
  owner.scope === "project" ? "Clone to project" : "Clone to organization";

export const modelsSettingsHref = (owner: ModelOwner) =>
  owner.scope === "project"
    ? `/project/${owner.projectId}/settings/models`
    : `/organization/${owner.organizationId}/settings/models`;

export const modelDetailHref = (owner: ModelOwner, modelId: string) =>
  `${modelsSettingsHref(owner)}/${modelId}`;

export function useCanEditModels(owner: ModelOwner) {
  const canEditProjectModels = useHasProjectAccess({
    projectId: owner.scope === "project" ? owner.projectId : undefined,
    scope: "models:CUD",
  });
  const canEditOrganizationModels = useHasOrganizationAccess({
    organizationId:
      owner.scope === "organization" ? owner.organizationId : undefined,
    scope: "organizationModels:CUD",
  });
  return owner.scope === "project"
    ? canEditProjectModels
    : canEditOrganizationModels;
}
