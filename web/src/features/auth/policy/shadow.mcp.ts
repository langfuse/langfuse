import { type IncomingHttpHeaders } from "http";

import { ForbiddenError } from "@langfuse/shared";

import { authorizeMcpTool, enforceMcpAccess } from "./enforcement.mcp";
import { type AuthorizationContext, type ProjectAction } from "./types";

/** resolveMcpAuthz is the MCP connection seam: authenticate, assert mcp:access, and resolve the bound project, throwing the denial to gate the connection. */
export async function resolveMcpAuthz(
  params: ResolveMcpAuthzParams,
): Promise<ResolvedMcpAuthz> {
  const result = await enforceMcpAccess({ headers: params.headers });
  if (!result.success) throw result.error;
  return { authz: result.context, projectId: result.projectId };
}

/** assertMcpToolAccess is the per-tool seam: it asserts the tool's own action against the resolved context before argument validation, fail-closed. */
export function assertMcpToolAccess(params: AssertMcpToolAccessParams): void {
  if (!params.authz) {
    throw new ForbiddenError(
      "Access denied: authorization context unavailable",
    );
  }

  const decision = authorizeMcpTool(
    params.authz,
    params.action,
    params.projectId,
  );
  if (!decision.success) throw decision.error;
}

/** ResolveMcpAuthzParams is the request headers the connection seam authenticates. */
export type ResolveMcpAuthzParams = {
  headers: IncomingHttpHeaders;
};

/** ResolvedMcpAuthz is the connection seam's output: the resolved context and the bound project. */
export type ResolvedMcpAuthz = {
  authz: AuthorizationContext;
  projectId: string;
};

/** AssertMcpToolAccessParams is the resolved context, the bound project, and the tool's own action and name. */
export type AssertMcpToolAccessParams = {
  authz?: AuthorizationContext;
  projectId: string;
  action: ProjectAction;
  toolName: string;
};
