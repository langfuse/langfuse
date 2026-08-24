/**
 * PROTOTYPE — THROWAWAY, does not merge (branch `prototype/pip-resolve-context`,
 * LFE-15458). `apiKeyAccessRights` is the `ApiKeyRole` → policies map the PIP keys
 * into, parallel to `projectRoleAccessRights` / `organizationRoleAccessRights`.
 * Values are `SystemPolicy[]` — policy-shaped but resource-less; the resolver binds
 * them to the key's project/org (or, for ADMIN, to the wildcard resource). Lives in
 * web (not shared): it references web-only vocabularies and its only consumer is the
 * web PIP. Production home: `web/src/features/rbac/constants/apiKeyAccessRights.ts`.
 */

import {
  allOrganizationActions,
  allProjectActions,
  type SystemPolicy,
  type SystemRule,
} from "@/src/features/auth/policy/policy.prototype";

/** ApiKeyRole is the policy layer's role vocabulary for an API key, decoupled from the DB `ApiKeyScope` enum: the two legacy scopes, SCORES_INGEST (the public-key presentation's `scores` access level), ADMIN (the ADMIN_API_KEY / instance admin), and VIEWER (read-only); Phase 3 presets extend it. */
export type ApiKeyRole =
  | "PROJECT"
  | "ORGANIZATION"
  | "SCORES_INGEST"
  | "ADMIN"
  | "VIEWER";

/** apiKeyAccessRights spells out the resource-less grant each `ApiKeyRole` carries; the resolver binds each to the key's project/org, or the wildcard resource for ADMIN. Phase 3 presets are not modelled here. */
export const apiKeyAccessRights: Record<ApiKeyRole, SystemPolicy[]> = {
  PROJECT: [
    {
      kind: "project",
      source: { kind: "role", id: "PROJECT" },
      effect: "allow",
      actions: allProjectActions,
    },
  ],
  ORGANIZATION: [
    {
      kind: "organization",
      source: { kind: "role", id: "ORGANIZATION" },
      effect: "allow",
      actions: allOrganizationActions,
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
  VIEWER: [
    {
      kind: "project",
      source: { kind: "role", id: "VIEWER" },
      effect: "allow",
      actions: allProjectActions.filter((action) => action.endsWith(":read")),
    },
    {
      kind: "organization",
      source: { kind: "role", id: "VIEWER" },
      effect: "allow",
      actions: allOrganizationActions.filter((action) =>
        action.endsWith(":read"),
      ),
    },
  ],
};

/** apiKeySystemRules maps each org entitlement suspension rule to the resource-less deny policies it applies — kept separate from `apiKeyAccessRights` because its source is a system rule, not a role. */
export const apiKeySystemRules: Record<SystemRule, SystemPolicy[]> = {
  ingestion_suspended: [
    {
      kind: "project",
      source: { kind: "system", rule: "ingestion_suspended" },
      effect: "deny",
      actions: ["traces:create", "scores:create", "media:create"],
    },
  ],
  mcp_suspended: [
    {
      kind: "project",
      source: { kind: "system", rule: "mcp_suspended" },
      effect: "deny",
      actions: ["mcp:access"],
    },
  ],
};
