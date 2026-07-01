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
import { redis } from "@langfuse/shared/src/server";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { ForbiddenError, UnauthorizedError } from "@langfuse/shared";
import { type ApiAccessScope } from "@langfuse/shared/src/server";
import { type ServerContext } from "@/src/features/mcp/types";
import { getMcpPublicApiAuth } from "@/src/features/mcp/features/publicApi";
import {
  extractBearerToken,
  isOidcEnabled,
  resolveOidcContextFromRequest,
} from "./oidc";

export type McpAuthResult = {
  context: ServerContext;
  scope: ApiAccessScope;
};

export async function authenticateMcpRequest(
  req: NextApiRequest,
): Promise<McpAuthResult> {
  const bearerToken = extractBearerToken(req.headers.authorization);

  // OIDC bearer path
  if (bearerToken && isOidcEnabled()) {
    const context = await resolveOidcContextFromRequest(req, bearerToken);
    const { scope } = await getMcpPublicApiAuth(context);
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
    isInAppAgentKey: authCheck.scope.isInAppAgentKey === true,
    authMethod: "api-key",
  };

  return { context, scope: authCheck.scope };
}
