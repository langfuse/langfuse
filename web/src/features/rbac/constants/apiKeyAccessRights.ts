import {
  allOrganizationActions,
  allProjectActions,
  type ProjectAction,
  type SystemRolePolicy,
} from "@/src/features/auth/policy/types";

/** ApiKeyRole is the policy layer's role vocabulary for an API key, decoupled from the DB `ApiKeyScope` enum. */
export type ApiKeyRole = "PROJECT" | "ORGANIZATION" | "SCORES_INGEST" | "ADMIN";

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

/** apiKeyAccessRights maps each `ApiKeyRole` to its resource-less grants; the resolver binds each to the key's project/org. */
export const apiKeyAccessRights: Record<ApiKeyRole, SystemRolePolicy[]> = {
  PROJECT: [
    {
      resourceKind: "project",
      effect: "ALLOW",
      actions: projectKeyActions,
    },
  ],
  ORGANIZATION: [
    {
      resourceKind: "organization",
      effect: "ALLOW",
      actions: allOrganizationActions,
    },
    {
      resourceKind: "project",
      effect: "ALLOW",
      actions: orgKeyProjectActions,
    },
  ],
  SCORES_INGEST: [
    {
      resourceKind: "project",
      effect: "ALLOW",
      actions: ["scores:create"],
    },
  ],
  ADMIN: [
    {
      resourceKind: "project",
      effect: "ALLOW",
      actions: allProjectActions,
    },
    {
      resourceKind: "organization",
      effect: "ALLOW",
      actions: allOrganizationActions,
    },
  ],
};
