/**
 * MCP request authentication dispatcher.
 *
 * Routes a request to the OIDC bearer-token path when the request carries
 * `Authorization: Bearer <JWT>` and OIDC is enabled; otherwise falls back to
 * the existing BasicAuth + API key flow.
 *
 * Both paths return a `ServerContext` plus an `ApiAccessScope` suitable for
 * rate-limiting and downstream public-API consumers.
 */

import { type NextApiRequest } from "next";
import { prisma } from "@langfuse/shared/src/db";
import { addUserToSpan, redis } from "@langfuse/shared/src/server";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { ForbiddenError, UnauthorizedError } from "@langfuse/shared";
import { type ApiAccessScope } from "@langfuse/shared/src/server";
import { type ServerContext } from "@/src/features/mcp/types";
import { getMcpPublicApiAuth } from "@/src/features/mcp/features/publicApi";
import { IN_APP_AGENT_MCP_TOOL_OVERRIDE_HEADER } from "@/src/ee/features/in-app-agent/constants";
import { InAppAgentMcpRunOverrideSchema } from "@/src/ee/features/in-app-agent/server/human-in-the-loop";
import { safeJsonParse } from "@/src/utils/json";
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
        permissions: "single-tool-override",
        allowedToolName: parsedOverride.data.toolName,
      }
    : { permissions: "read" };
}

export async function authenticateMcpRequest(
  req: NextApiRequest,
): Promise<McpAuthResult> {
  const bearerToken = extractBearerToken(req.headers.authorization);

  // OIDC bearer path
  if (bearerToken && isOidcEnabled()) {
    const identity = await resolveOidcContextFromRequest(req, bearerToken);
    // getMcpPublicApiAuth derives plan / rateLimitOverrides from the org's
    // cloud config; fold them onto the context so plan-based rate limiting in
    // tools sees the same values the BasicAuth path gets from the API key.
    const { scope } = await getMcpPublicApiAuth(identity);
    const context: ServerContext = {
      ...identity,
      plan: scope.plan,
      rateLimitOverrides: scope.rateLimitOverrides,
    };

    addUserToSpan({
      userId: context.userId,
      apiKeyId: scope.apiKeyId,
      publicKey: scope.publicKey,
      projectId: scope.projectId,
      orgId: scope.orgId,
      plan: scope.plan,
    });

    return { context, scope };
  }

  // BasicAuth + API key path (existing behavior)
  const authCheck = await new ApiAuthService(
    prisma,
    redis,
  ).verifyAuthHeaderAndReturnScope(req.headers.authorization, {
    allowInAppAgentKey: true,
  });

  if (!authCheck.validKey) {
    throw new UnauthorizedError(authCheck.error);
  }

  if (authCheck.scope.accessLevel !== "project" || !authCheck.scope.projectId) {
    throw new ForbiddenError(
      "Access denied: MCP requires project-scoped API keys with BasicAuth",
    );
  }

  addUserToSpan({
    apiKeyId: authCheck.scope.apiKeyId,
    publicKey: authCheck.scope.publicKey,
    projectId: authCheck.scope.projectId,
    orgId: authCheck.scope.orgId,
    plan: authCheck.scope.plan,
  });

  if (authCheck.scope.isIngestionSuspended) {
    throw new ForbiddenError(
      "Access suspended: Usage threshold exceeded. Please upgrade your plan.",
    );
  }

  const context: ServerContext = {
    projectId: authCheck.scope.projectId,
    orgId: authCheck.scope.orgId,
    userId: undefined,
    apiKeyId: authCheck.scope.apiKeyId,
    accessLevel: "project",
    publicKey: authCheck.scope.publicKey,
    plan: authCheck.scope.plan,
    rateLimitOverrides: authCheck.scope.rateLimitOverrides,
    userAgent: req.headers["user-agent"],
    inAppAgent: getInAppAgentContext(req, authCheck.scope.isInAppAgentKey),
    authMethod: "api-key",
  };

  return { context, scope: authCheck.scope };
}
