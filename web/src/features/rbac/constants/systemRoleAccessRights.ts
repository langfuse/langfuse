import { projectRoleAccessRights } from "@langfuse/shared";
import { type Role, type SystemRole } from "@langfuse/shared/src/db";

import { apiKeyAccessRights } from "@/src/features/rbac/constants/apiKeyAccessRights";
import { organizationRoleAccessRights } from "@/src/features/rbac/constants/organizationAccessRights";
import {
  type SystemRoleDefinition,
  type SystemRolePolicy,
} from "@/src/features/rbac/types";

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
      tags: ["principal:user"],
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
      tags: ["principal:user"],
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
      policies: apiKeyAccessRights.PROJECT,
      tags: ["principal:apiKey"],
    },
    ORGANIZATION: {
      id: "ORGANIZATION",
      name: "Organization API key",
      description: "Administer the organization and all of its projects.",
      policies: apiKeyAccessRights.ORGANIZATION,
      tags: ["principal:apiKey"],
    },
    SCORES_INGEST: {
      id: "SCORES_INGEST",
      name: "Scores ingestion",
      description: "Create scores in a project.",
      policies: apiKeyAccessRights.SCORES_INGEST,
      tags: ["principal:apiKey"],
    },
    INGEST: {
      id: "INGEST",
      name: "Ingestion",
      description: "Create traces, scores, and media in a project.",
      policies: [
        {
          resourceKind: "project",
          effect: "ALLOW",
          actions: ["traces:create", "scores:create", "media:create"],
        },
      ],
      tags: ["principal:apiKey"],
    },
    LLM_GATEWAY: {
      id: "LLM_GATEWAY",
      name: "LLM gateway",
      description: "Invoke the organization's LLM gateway.",
      policies: [
        {
          resourceKind: "organization",
          effect: "ALLOW",
          actions: ["gateway:invoke"],
        },
      ],
      tags: ["principal:apiKey"],
    },
  };
