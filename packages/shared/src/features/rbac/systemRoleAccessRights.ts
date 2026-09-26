import { type Role, type SystemRole } from "../../db";
import {
  organizationRoleAccessRights,
  organizationScopes,
  type OrganizationScope,
} from "./organizationAccessRights";
import {
  projectRoleAccessRights,
  projectScopes,
  type ProjectScope,
} from "./projectAccessRights";

/** allProjectActions is the full project action vocabulary. */
export const allProjectActions: ProjectAction[] = [...projectScopes];

/** allOrganizationActions is the full organization action vocabulary. */
export const allOrganizationActions: OrganizationAction[] = [
  ...organizationScopes,
];

/** organizationActionSet is allOrganizationActions indexed for membership tests. */
const organizationActionSet: ReadonlySet<string> = new Set(organizationScopes);

/** isOrgAction reports whether an action belongs to the disjoint org vocabulary. */
export const isOrgAction = (action: Action): action is OrganizationAction =>
  organizationActionSet.has(action);

/** Effect is whether a policy grants or denies its actions. */
export type Effect = "ALLOW" | "DENY";

/** ProjectAction is an action assignable to a project policy. */
export type ProjectAction = ProjectScope;

/** OrganizationAction is an action assignable to an organization policy. */
export type OrganizationAction = OrganizationScope;

/** Action is any checkable action. */
export type Action = ProjectAction | OrganizationAction;

/** SystemRolePolicy is a catalog policy before its resource is bound. */
export type SystemRolePolicy =
  | {
      resourceKind: "organization";
      actions: OrganizationAction[];
      effect: Effect;
    }
  | { resourceKind: "project"; actions: ProjectAction[]; effect: Effect };

/** SystemRoleTag marks a role's intended principal kind, or `"legacy"` for a role still valid on existing keys but no longer offered for new ones. */
export type SystemRoleTag = "principal:apiKey" | "principal:user" | "legacy";

/** SystemRoleDefinition is an in-code system role's catalog entry: metadata plus its resource-less policies. */
export type SystemRoleDefinition = {
  id: SystemRole;
  name: string;
  description: string;
  policies: SystemRolePolicy[];
  tags: SystemRoleTag[];
};

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
      tags: ["principal:apiKey", "legacy"],
    },
    ORGANIZATION: {
      id: "ORGANIZATION",
      name: "Organization API key",
      description: "Administer the organization and all of its projects.",
      policies: [
        allow("organization", allOrganizationActions),
        allow("project", orgKeyProjectActions),
      ],
      tags: ["principal:apiKey", "legacy"],
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
    AI_GATEWAY: {
      id: "AI_GATEWAY",
      name: "AI Gateway",
      description: "Invoke the organization's AI Gateway.",
      policies: [allow("organization", ["gateway:invoke"])],
      tags: ["principal:apiKey"],
    },
  };

/** roleHasProjectPolicy reports whether a role grants any project-kind policy. */
export const roleHasProjectPolicy = (role: SystemRole): boolean =>
  systemRoleAccessRights[role].policies.some(
    (policy) => policy.resourceKind === "project",
  );

/** isApiKeyRole reports whether a role may back an api key at all, including legacy roles still valid on existing keys. */
export const isApiKeyRole = (role: SystemRole): boolean =>
  systemRoleAccessRights[role].tags.includes("principal:apiKey");

/** isAssignableAtCreate reports whether a role is offered when creating a new api key: an api-key role that is not retired as legacy. */
export const isAssignableAtCreate = (role: SystemRole): boolean =>
  isApiKeyRole(role) && !systemRoleAccessRights[role].tags.includes("legacy");

/** apiKeyRolesForScope lists, in catalog order, the roles offered when creating an api key at the given scope: project-capable roles for a project key, every creatable api-key role for an organization key. */
export const apiKeyRolesForScope = (
  scope: "project" | "organization",
): SystemRole[] =>
  (Object.keys(systemRoleAccessRights) as SystemRole[]).filter((role) =>
    scope === "project"
      ? isAssignableAtCreate(role) && roleHasProjectPolicy(role)
      : isAssignableAtCreate(role),
  );
