/**
 * PROTOTYPE — THROWAWAY, does not merge (branch `prototype/parity-classification`,
 * LFE-15559). The MCP connection seam's shadow drop-in: `verifyMcpConnection`
 * runs the legacy verify (+ the project-scoped-key gate) and the new
 * `mcp:access` check as two non-throwing paths, diffs them in shadow, then
 * decides. The per-tool level is net-new (legacy runs no per-tool gate) and
 * lives in define-tool.prototype. Legacy's scope still shapes ServerContext,
 * so the connection returns both it and the new decision (dies with LFE-15033).
 */

import { type NextApiRequest } from "next";

import { ForbiddenError, UnauthorizedError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  redis,
  type AuthHeaderValidVerificationResult,
} from "@langfuse/shared/src/server";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import {
  enforceProjectAuth,
  type EnforceProjectAuthDecision,
} from "./enforcement.projects.prototype";
import { authzMigrationMode } from "./enforcement.organizations.prototype";
import {
  diffResults,
  legacyFromStatus,
  type LegacyAuthDecision,
} from "./shadow.prototype";

/** verifyMcpConnection is the MCP connection drop-in: it runs the legacy verify (+ project-scoped-key gate) and the new `mcp:access` check as two non-throwing paths, diffs them in shadow, then throws on deny — legacy decides in shadow, the new decision also gates in enforce. It returns the legacy scope (which shapes ServerContext) and the new decision (which supplies `ServerContext.authz`). */
export async function verifyMcpConnection(params: {
  req: NextApiRequest;
}): Promise<McpConnection> {
  const legacy = await runLegacyMcpAuth(params.req);
  const enforced = await enforceProjectAuth({
    headers: params.req.headers,
    action: "mcp:access",
    allowInAppAgentKey: true,
  });

  if (authzMigrationMode === "shadow") {
    diffResults(enforced, legacyFromStatus(legacy.status), {
      seam: "mcp_access",
      action: "mcp:access",
    });
  }
  // ServerContext is shaped from the legacy scope in both modes (dies with
  // LFE-15033), so the legacy verify must pass regardless of mode
  if (!legacy.ok) throw legacy.error;
  if (authzMigrationMode === "enforce" && !enforced.success) throw enforced.error;
  return {
    authCheck: legacy.auth.authCheck,
    projectId: legacy.auth.projectId,
    enforced,
  };
}

/** runLegacyMcpAuth is the legacy non-throwing path: the single verify plus MCP's project-scoped-key requirement, captured as a value with the status the connection would have sent. */
async function runLegacyMcpAuth(
  req: NextApiRequest,
): Promise<LegacyAuthDecision<McpLegacyAuth>> {
  const authCheck = await new ApiAuthService(
    prisma,
    redis,
  ).verifyAuthHeaderAndReturnScope(req.headers.authorization, {
    allowInAppAgentKey: true,
  });
  if (!authCheck.validKey) {
    return {
      ok: false,
      status: 401,
      error: new UnauthorizedError(authCheck.error),
    };
  }
  if (authCheck.scope.accessLevel !== "project" || !authCheck.scope.projectId) {
    return {
      ok: false,
      status: 403,
      error: new ForbiddenError(
        "This endpoint requires a project-scoped API key.",
      ),
    };
  }
  return {
    ok: true,
    status: 200,
    auth: { authCheck, projectId: authCheck.scope.projectId },
  };
}

/** McpLegacyAuth is the legacy MCP connection's verified value: the scope and the project it resolved. */
type McpLegacyAuth = {
  authCheck: AuthHeaderValidVerificationResult;
  projectId: string;
};

/** McpConnection is the connection drop-in's success: the legacy scope, the resolved project, and the new decision that supplies `ServerContext.authz`. */
type McpConnection = {
  authCheck: AuthHeaderValidVerificationResult;
  projectId: string;
  enforced: EnforceProjectAuthDecision;
};
