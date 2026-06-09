/**
 * MCP request authentication dispatcher.
 *
 * Routes a request to the OIDC bearer-token path when the request carries
 * `Authorization: Bearer <JWT>` and OIDC is enabled; otherwise falls back to
 * the existing BasicAuth + API key flow.
 *
 * Both paths return a `ServerContext` (including the policy-core
 * `AuthorizationContext` each tool authorizes against) plus an
 * `ApiAccessScope` suitable for rate-limiting.
 */

import { type NextApiRequest } from "next";
import { prisma } from "@langfuse/shared/src/db";
import {
  addUserToSpan,
  type ApiAccessScope,
} from "@langfuse/shared/src/server";
import {
  ForbiddenError,
  InternalServerError,
  safeJsonParse,
} from "@langfuse/shared";
import { type ServerContext } from "@/src/features/mcp/types";
import { getAuditRequestContext } from "@/src/features/audit-logs/server/getAuditRequestContext";
import { shadowAuth } from "@/src/features/public-api/server/shadowAuth";
import { __dangerouslySkipAuthz } from "@/src/features/public-api/server/enforceAuth";
import { OrganizationRepository } from "@/src/features/auth/policy/organizationRepository";
import {
  getPoliciesForUser,
  toPrincipalOrganization,
} from "@/src/features/auth/policy/contextResolver";
import { type AuthorizationContext } from "@/src/features/auth/policy/types";
import { IN_APP_AGENT_MCP_TOOL_OVERRIDE_HEADER } from "@langfuse/shared/in-app-agent";
import { InAppAgentMcpRunOverrideSchema } from "@langfuse/shared/in-app-agent/server/mcpPolicy";
import {
  extractBearerToken,
  isOidcEnabled,
  resolveOidcContextFromRequest,
} from "./oidc";

export type McpAuthResult = {
  context: ServerContext;
  scope: ApiAccessScope;
};

/**
 * Resolve the in-app-agent authorization state for a BasicAuth request.
 *
 * In-app-agent keys need a run override for mutating tools; read-only tools
 * remain available without it via their MCP `readOnlyHint` annotation. Returns
 * `undefined` for ordinary project API keys.
 */
export function getInAppAgentContext(
  req: NextApiRequest,
  isInAppAgentKey: boolean | undefined,
): ServerContext["inAppAgent"] {
  if (isInAppAgentKey !== true) {
    return undefined;
  }

  const headerValue = req.headers[IN_APP_AGENT_MCP_TOOL_OVERRIDE_HEADER];

  if (typeof headerValue !== "string") {
    return { permissions: "read" };
  }

  const parsedOverride = InAppAgentMcpRunOverrideSchema.safeParse(
    safeJsonParse(headerValue),
  );

  return parsedOverride.success
    ? {
        permissions: "tool-allowlist",
        allowedToolNames: parsedOverride.data.toolNames,
      }
    : { permissions: "read" };
}

export async function authenticateMcpRequest(
  req: NextApiRequest,
): Promise<McpAuthResult> {
  const bearerToken = extractBearerToken(req.headers.authorization);

  if (bearerToken && isOidcEnabled()) {
    return authenticateOidcRequest(req, bearerToken);
  }

  return authenticateApiKeyRequest(req);
}

/** authenticateApiKeyRequest is the BasicAuth + project API key path. */
async function authenticateApiKeyRequest(
  req: NextApiRequest,
): Promise<McpAuthResult> {
  // Each tool authorizes its own action.
  const authResult = await shadowAuth({
    req,
    action: __dangerouslySkipAuthz,
    allowedAccessLevels: ["project"],
    allowInAppAgentKey: true,
  });

  if (!authResult.success) {
    throw authResult.error;
  }

  const { scope, ctx } = authResult;

  // MCP requires project-scoped access (no org-level keys)
  if (scope.accessLevel !== "project" || !scope.projectId) {
    throw new ForbiddenError(
      "Access denied: MCP requires project-scoped API keys with BasicAuth",
    );
  }

  addUserToSpan({
    apiKeyId: scope.apiKeyId,
    publicKey: scope.publicKey,
    projectId: scope.projectId,
    orgId: scope.orgId,
    plan: scope.plan,
  });

  // Check if ingestion is suspended due to usage limits
  if (scope.isIngestionSuspended) {
    throw new ForbiddenError(
      "Access suspended: Usage threshold exceeded. Please upgrade your plan.",
    );
  }

  const context: ServerContext = {
    projectId: scope.projectId,
    orgId: scope.orgId,
    userId: undefined, // API keys don't have associated users
    apiKeyId: scope.apiKeyId,
    accessLevel: "project",
    publicKey: scope.publicKey,
    plan: scope.plan,
    rateLimitOverrides: scope.rateLimitOverrides,
    accessAuditLogEnabled: scope.accessAuditLogEnabled,
    userAgent: req.headers["user-agent"],
    auditRequest: getAuditRequestContext(req.headers, req.socket.remoteAddress),
    inAppAgent: getInAppAgentContext(req, scope.isInAppAgentKey),
    auth: ctx,
    authMethod: "api-key",
  };

  return { context, scope };
}

/**
 * authenticateOidcRequest verifies the bearer JWT, then builds a user-principal
 * authorization context so tools authorize against the user's own roles.
 */
async function authenticateOidcRequest(
  req: NextApiRequest,
  bearerToken: string,
): Promise<McpAuthResult> {
  const identity = await resolveOidcContextFromRequest(req, bearerToken);

  const found = await new OrganizationRepository().getOrganizationByProjectId(
    identity.projectId,
  );
  if (!found.success) throw found.error;
  if (!found.organization || found.organization.id !== identity.orgId) {
    throw new InternalServerError(
      `project ${identity.projectId} resolved to no matching organization`,
    );
  }
  const organization = toPrincipalOrganization(found.organization);

  const auth: AuthorizationContext = {
    principal: {
      kind: "user",
      userId: identity.userId,
      organizations: [organization],
    },
    policies: [await getPoliciesForUser(prisma, identity.userId)],
  };

  const accessAuditLogEnabled = organization.accessAuditLogEnabled ?? false;
  const scope: ApiAccessScope = {
    projectId: identity.projectId,
    orgId: organization.orgId,
    organizationCreatedAt: organization.organizationCreatedAt,
    apiKeyId: identity.apiKeyId,
    publicKey: identity.publicKey,
    accessLevel: "project",
    plan: organization.plan,
    rateLimitOverrides: organization.rateLimitOverrides,
    isIngestionSuspended: organization.isIngestionSuspended,
    isInAppAgentKey: false,
    accessAuditLogEnabled,
  };

  addUserToSpan({
    userId: identity.userId,
    apiKeyId: scope.apiKeyId,
    publicKey: scope.publicKey,
    projectId: identity.projectId,
    orgId: scope.orgId,
    plan: scope.plan,
  });

  const context: ServerContext = {
    ...identity,
    plan: scope.plan,
    rateLimitOverrides: scope.rateLimitOverrides,
    accessAuditLogEnabled,
    auditRequest: getAuditRequestContext(req.headers, req.socket.remoteAddress),
    auth,
  };

  return { context, scope };
}
