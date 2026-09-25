import { projectRoleAccessRights } from "@langfuse/shared";
import { type Role, type SystemRole } from "@langfuse/shared/src/db";

import { organizationRoleAccessRights } from "@/src/features/rbac/constants/organizationAccessRights";
import {
  allOrganizationActions,
  allProjectActions,
  type ProjectAction,
  type SystemRoleDefinition,
  type SystemRolePolicy,
} from "@/src/features/rbac/types";

/** allow builds a resource-less `SystemRolePolicy`, correlating its action vocabulary to the resource kind. */
const allow = <K extends SystemRolePolicy["resourceKind"]>(
  resourceKind: K,
  actions: Extract<SystemRolePolicy, { resourceKind: K }>["actions"],
  effect: SystemRolePolicy["effect"] = "ALLOW",
): SystemRolePolicy => ({ resourceKind, actions, effect }) as SystemRolePolicy;

/** userRoleAccessRights builds a user role's org- and project-kind policies from the per-role access-right tables. */
const userRoleAccessRights = (role: Role): SystemRolePolicy[] => [
  allow("organization", organizationRoleAccessRights[role]),
  allow("project", projectRoleAccessRights[role]),
];

/** orgKeyProjectActions are the project-kind actions an ORGANIZATION key holds against its own projects. */
const orgKeyProjectActions: ProjectAction[] = [
  "project:read",
  "apiKeys:read",
  "apiKeys:CUD",
  "projectMembers:read",
  "projectMembers:CUD",
  "project:update",
  "project:delete",
];

/** projectKeyActions is the project vocabulary a PROJECT key holds, less the project-administration actions reserved for ORGANIZATION keys and the session user. */
const projectKeyActions: ProjectAction[] = allProjectActions.filter(
  (action) =>
    action === "project:read" || !orgKeyProjectActions.includes(action),
);

/** systemRoleAccessRights maps each `SystemRole` to its rich definition; the resolver binds each policy to concrete org/project resources. */
export const systemRoleAccessRights: Record<SystemRole, SystemRoleDefinition> =
  {
    OWNER: {
      id: "OWNER",
      name: "Owner",
      description: "Full organization and project access.",
      policies: userRoleAccessRights("OWNER"),
      tags: ["principal:user"],
    },
    ADMIN: {
      id: "ADMIN",
      name: "Admin",
      description: "Administer the organization and its projects.",
      policies: userRoleAccessRights("ADMIN"),
      tags: ["principal:user", "principal:apiKey"],
    },
    MEMBER: {
      id: "MEMBER",
      name: "Member",
      description: "Work within the organization and its projects.",
      policies: userRoleAccessRights("MEMBER"),
      tags: ["principal:user"],
    },
    VIEWER: {
      id: "VIEWER",
      name: "Viewer",
      description: "Read-only access to the organization and its projects.",
      policies: userRoleAccessRights("VIEWER"),
      tags: ["principal:user", "principal:apiKey"],
    },
    NONE: {
      id: "NONE",
      name: "None",
      description: "No organization or project access.",
      policies: userRoleAccessRights("NONE"),
      tags: ["principal:user"],
    },
    PROJECT: {
      id: "PROJECT",
      name: "Project API key",
      description: "Read and write within a single project.",
      policies: [allow("project", projectKeyActions)],
      tags: ["principal:apiKey"],
    },
    ORGANIZATION: {
      id: "ORGANIZATION",
      name: "Organization API key",
      description: "Administer the organization and all of its projects.",
      policies: [
        allow("organization", allOrganizationActions),
        allow("project", orgKeyProjectActions),
      ],
      tags: ["principal:apiKey"],
    },
    SCORES_INGEST: {
      id: "SCORES_INGEST",
      name: "Scores ingestion",
      description: "Create scores in a project.",
      policies: [allow("project", ["scores:create"])],
      tags: ["principal:apiKey"],
    },
    INGEST: {
      id: "INGEST",
      name: "Ingestion",
      description: "Create traces, scores, and media in a project.",
      policies: [
        allow("project", ["traces:create", "scores:create", "media:create"]),
      ],
      tags: ["principal:apiKey"],
    },
    LLM_GATEWAY: {
      id: "LLM_GATEWAY",
      name: "LLM gateway",
      description: "Invoke the organization's LLM gateway.",
      policies: [allow("organization", ["gateway:invoke"])],
      tags: ["principal:apiKey"],
    },
  };
