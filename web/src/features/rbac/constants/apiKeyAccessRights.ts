import {
  allOrganizationActions,
  allProjectActions,
  type ProjectAction,
  type SystemPolicy,
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

/** apiKeyAccessRights maps each `ApiKeyRole` to its resource-less grants; the resolver binds each to the key's project/org, or the wildcard for ADMIN. */
export const apiKeyAccessRights: Record<ApiKeyRole, SystemPolicy[]> = {
  PROJECT: [
    {
      kind: "project",
      source: { kind: "role", id: "PROJECT" },
      effect: "allow",
      actions: projectKeyActions,
    },
  ],
  ORGANIZATION: [
    {
      kind: "organization",
      source: { kind: "role", id: "ORGANIZATION" },
      effect: "allow",
      actions: allOrganizationActions,
    },
    {
      kind: "project",
      source: { kind: "role", id: "ORGANIZATION" },
      effect: "allow",
      actions: orgKeyProjectActions,
    },
  ],
  SCORES_INGEST: [
    {
      kind: "project",
      source: { kind: "role", id: "SCORES_INGEST" },
      effect: "allow",
      actions: ["scores:create"],
    },
  ],
  ADMIN: [
    {
      kind: "project",
      source: { kind: "role", id: "ADMIN" },
      effect: "allow",
      actions: allProjectActions,
    },
    {
      kind: "organization",
      source: { kind: "role", id: "ADMIN" },
      effect: "allow",
      actions: allOrganizationActions,
    },
  ],
};
