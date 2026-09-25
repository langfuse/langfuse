import { projectRoleAccessRights } from "@langfuse/shared";
import { type Role, type SystemRole } from "@langfuse/shared/src/db";

import { type SystemRolePolicy } from "@/src/features/auth/policy/types";
import { apiKeyAccessRights } from "@/src/features/rbac/constants/apiKeyAccessRights";
import { organizationRoleAccessRights } from "@/src/features/rbac/constants/organizationAccessRights";

/** userRoleAccessRights builds a user role's org- and project-kind policies from the per-role access-right tables. */
const userRoleAccessRights = (role: Role): SystemRolePolicy[] => [
  {
    resourceKind: "organization",
    effect: "ALLOW",
    actions: organizationRoleAccessRights[role],
  },
  {
    resourceKind: "project",
    effect: "ALLOW",
    actions: projectRoleAccessRights[role],
  },
];

/** systemRoleAccessRights maps each `SystemRole` to its resource-less grants; a later ticket binds them to concrete org/project resources. */
export const systemRoleAccessRights: Record<SystemRole, SystemRolePolicy[]> = {
  OWNER: userRoleAccessRights("OWNER"),
  ADMIN: userRoleAccessRights("ADMIN"),
  MEMBER: userRoleAccessRights("MEMBER"),
  VIEWER: userRoleAccessRights("VIEWER"),
  NONE: userRoleAccessRights("NONE"),
  PROJECT: apiKeyAccessRights.PROJECT,
  ORGANIZATION: apiKeyAccessRights.ORGANIZATION,
  SCORES_INGEST: apiKeyAccessRights.SCORES_INGEST,
  INGEST: [
    {
      resourceKind: "project",
      effect: "ALLOW",
      actions: ["traces:create", "scores:create", "media:create"],
    },
  ],
  LLM_GATEWAY: [
    {
      resourceKind: "organization",
      effect: "ALLOW",
      actions: ["gateway:invoke"],
    },
  ],
};
