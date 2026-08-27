import { type NextApiRequest } from "next";

import { env } from "@/src/env.mjs";
import { shadowAuth } from "@/src/features/public-api/server/shadowAuth";
import { authorize } from "./authorize";
import { type AuthorizationContext, type ProjectAction } from "./types";

/** mcpAccessAction is the connection-level action every MCP credential must hold. */
const mcpAccessAction: ProjectAction = "mcp:access";

/** resolveMcpAuthz routes the MCP connection through shadowAuth: legacy skips it, shadow leaves the legacy authCheck in charge, enforce gates the connection and yields the context that authorizes each tool. */
export async function resolveMcpAuthz(
  params: ResolveMcpAuthzParams,
): Promise<ResolvedMcpAuthz> {
  if (env.API_AUTH_MIGRATION === "legacy") return {};

  const result = await shadowAuth({
    req: params.req,
    action: mcpAccessAction,
    allowedAccessLevels: ["project"],
    allowInAppAgentKey: true,
  });

  if (!result.success) {
    if (env.API_AUTH_MIGRATION === "enforce") throw result.error;
    return {};
  }
  return { authz: result.ctx };
}

/** assertMcpToolAccess authorizes a tool's own action against the resolved context, fail-closed; absent context means legacy or shadow, where the tool is not gated. */
export function assertMcpToolAccess(params: AssertMcpToolAccessParams): void {
  if (!params.authz) return;
  const decision = authorize(params.authz, params.action, {
    projectId: params.projectId,
  });
  if (!decision.success) throw decision.error;
}

/** ResolveMcpAuthzParams is the request the connection seam authorizes. */
export type ResolveMcpAuthzParams = {
  req: NextApiRequest;
};

/** ResolvedMcpAuthz carries the authorizing context, present only once enforce resolves the connection. */
export type ResolvedMcpAuthz = {
  authz?: AuthorizationContext;
};

/** AssertMcpToolAccessParams is the resolved context, the bound project, and the tool's own action. */
export type AssertMcpToolAccessParams = {
  authz?: AuthorizationContext;
  projectId: string;
  action: ProjectAction;
};
