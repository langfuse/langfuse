/**
 * Authorization contexts for MCP tests that need no database: a project key
 * bound to one project, and an organization key whose project/* policy covers
 * every project of its organization.
 */

import {
  OrganizationId,
  ProjectId,
  SystemRoleId,
  type ProjectAction,
} from "@langfuse/shared/rbac";

import type { AuthorizationContext } from "@/src/features/auth/policy/types";
import type { Policy } from "@/src/features/rbac/types";
import type { McpConnection } from "@/src/features/mcp/types";

type FixtureOrg = { orgId: string; projectIds: string[] };

/** mockAuthContext builds an api-key context: bound to a project when projectId is set, else to the organization with project/* policies. */
export function mockAuthContext(params: {
  orgId: string;
  projectId?: string;
  actions: ProjectAction[];
  organizations?: FixtureOrg[];
}): AuthorizationContext {
  const { orgId, projectId, actions } = params;
  const organizations = params.organizations ?? [
    { orgId, projectIds: projectId ? [projectId] : [] },
  ];
  const policy: Policy = {
    id: "fixture:project",
    tenantId: OrganizationId(orgId),
    roleId: SystemRoleId(projectId ? "LEGACY_PROJECT_API_KEY" : "ADMIN"),
    actions: actions as never,
    resources: [ProjectId(projectId ?? "*")],
    effect: "ALLOW",
  };
  return {
    principal: {
      kind: "apiKey",
      apiKeyId: "key_1",
      userId: null,
      isInAppAgentKey: false,
      publicKey: "pk-lf-1",
      scope: projectId ? "PROJECT" : "ORGANIZATION",
      presentation: "privateKey",
      organizations: organizations.map((org) => ({
        ...org,
        organizationCreatedAt: "2024-01-01T00:00:00.000Z",
        plan: "cloud:hobby",
        rateLimitOverrides: [],
        isIngestionSuspended: false,
        accessAuditLogEnabled: false,
      })),
      boundResource: { orgId, ...(projectId ? { projectId } : {}) },
    },
    policies: [[policy]],
  };
}

/** mockConnection is the MCP connection of an authorization context. */
export function mockConnection(auth: AuthorizationContext): McpConnection {
  const { principal } = auth;
  return {
    auth,
    apiKeyId: "key_1",
    publicKey: "pk-lf-1",
    boundProjectId:
      principal.kind === "apiKey"
        ? principal.boundResource.projectId
        : undefined,
  };
}
