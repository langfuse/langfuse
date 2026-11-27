import {
  OrganizationId,
  ProjectId,
  SystemRoleId,
  type ProjectAction,
} from "@langfuse/shared/rbac";
import type { AuthorizationContext } from "@/src/features/auth/policy/types";
import type { Policy } from "@/src/features/rbac/types";
import type { McpConnection } from "@/src/features/mcp/types";

/** mockAuthContext builds an api-key context bound to projectId, or to the organization with project/* policies. */
export function mockAuthContext(params: {
  orgId: string;
  projectId?: string;
  actions: ProjectAction[];
  organizations?: FixtureOrg[];
}): AuthorizationContext {
  const { orgId, projectId, actions } = params;
  const organizations =
    params.organizations ?? defaultOrganizations(orgId, projectId);
  return {
    principal: {
      kind: "apiKey",
      apiKeyId: "key_1",
      userId: null,
      isInAppAgentKey: false,
      publicKey: "pk-lf-1",
      scope: keyScope(projectId),
      presentation: "privateKey",
      organizations: organizations.map(toPrincipalOrganization),
      boundResource: boundResource(orgId, projectId),
    },
    policies: [[fixturePolicy(orgId, projectId, actions)]],
  };
}

/** mockConnection is the MCP connection of an authorization context. */
export function mockConnection(auth: AuthorizationContext): McpConnection {
  return {
    auth,
    apiKeyId: "key_1",
    publicKey: "pk-lf-1",
    boundProjectId: boundProjectIdOf(auth),
  };
}

/** defaultOrganizations is the key's own organization, holding its bound project if any. */
function defaultOrganizations(orgId: string, projectId?: string): FixtureOrg[] {
  if (projectId) return [{ orgId, projectIds: [projectId] }];
  return [{ orgId, projectIds: [] }];
}

/** keyScope is the api key scope a fixture key is created with. */
function keyScope(projectId?: string): "PROJECT" | "ORGANIZATION" {
  if (projectId) return "PROJECT";
  return "ORGANIZATION";
}

/** boundResource is the organization, and project if any, a fixture key is bound to. */
function boundResource(orgId: string, projectId?: string) {
  if (projectId) return { orgId, projectId };
  return { orgId };
}

/** fixturePolicy grants actions on the bound project, or on every project of the organization. */
function fixturePolicy(
  orgId: string,
  projectId: string | undefined,
  actions: ProjectAction[],
): Policy {
  return {
    id: "fixture:project",
    tenantId: OrganizationId(orgId),
    roleId: SystemRoleId(fixtureRole(projectId)),
    actions: actions as never,
    resources: [ProjectId(projectId ?? "*")],
    effect: "ALLOW",
  };
}

/** fixtureRole is the role a fixture key holds for its scope. */
function fixtureRole(projectId?: string) {
  if (projectId) return "LEGACY_PROJECT_API_KEY";
  return "ADMIN";
}

/** toPrincipalOrganization fills a fixture organization's plan and flags. */
function toPrincipalOrganization(org: FixtureOrg) {
  return {
    ...org,
    organizationCreatedAt: "2024-01-01T00:00:00.000Z",
    plan: "cloud:hobby" as const,
    rateLimitOverrides: [],
    isIngestionSuspended: false,
    accessAuditLogEnabled: false,
  };
}

/** boundProjectIdOf is the project an api-key principal is bound to. */
function boundProjectIdOf(auth: AuthorizationContext): string | undefined {
  const { principal } = auth;
  if (principal.kind !== "apiKey") return undefined;
  return principal.boundResource.projectId;
}

type FixtureOrg = { orgId: string; projectIds: string[] };
