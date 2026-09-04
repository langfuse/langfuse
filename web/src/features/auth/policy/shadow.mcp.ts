import { type IncomingHttpHeaders } from "http";

import { ForbiddenError } from "@langfuse/shared";

import { env } from "@/src/env.mjs";
import {
  authorizeMcpTool,
  enforceMcpAccess,
  mcpAccessAction,
} from "./enforcement.mcp";
import { diffResults, recordCoverage } from "./shadow";
import { type AuthorizationContext, type ProjectAction } from "./types";

/** mcpCoverageOperation is the coverage key for the MCP connection seam. */
const mcpCoverageOperation = "mcp";

/** resolveMcpAuthz is the MCP connection seam: legacy skips it, shadow attaches authz only when the new path resolves, enforce gates the connection on it. */
export async function resolveMcpAuthz(
  params: ResolveMcpAuthzParams,
): Promise<ResolvedMcpAuthz> {
  if (env.PUBLIC_API_AUTHZ_MIGRATION === "legacy") return {};

  const result = await enforceMcpAccess({ headers: params.headers });

  if (env.PUBLIC_API_AUTHZ_MIGRATION === "shadow") {
    recordCoverage(mcpCoverageOperation);
    diffResults(
      result,
      { ok: true },
      { seam: "mcp_access", action: mcpAccessAction },
    );
    return { authz: result.success ? result.context : undefined };
  }

  if (!result.success) throw result.error;
  return { authz: result.context };
}

/** assertMcpToolAccess is the per-tool seam: legacy has no opinion, shadow records net_new parity, enforce blocks fail-closed before argument validation. */
export function assertMcpToolAccess(params: AssertMcpToolAccessParams): void {
  const mode = env.PUBLIC_API_AUTHZ_MIGRATION;
  if (mode === "legacy") return;

  if (!params.authz) {
    if (mode === "enforce") {
      throw new ForbiddenError(
        "Access denied: authorization context unavailable",
      );
    }
    return;
  }

  const decision = authorizeMcpTool(
    params.authz,
    params.action,
    params.projectId,
  );

  if (mode === "shadow") {
    recordCoverage(params.toolName);
    diffResults(
      decision,
      { absent: true },
      { seam: "mcp_tool", action: params.action },
    );
    return;
  }

  if (!decision.success) throw decision.error;
}

/** ResolveMcpAuthzParams is the request headers the connection seam authenticates. */
export type ResolveMcpAuthzParams = {
  headers: IncomingHttpHeaders;
};

/** ResolvedMcpAuthz is the connection seam's output: the resolved context, or absent when legacy or an unresolved shadow path. */
export type ResolvedMcpAuthz = {
  authz?: AuthorizationContext;
};

/** AssertMcpToolAccessParams is the resolved context, the bound project, and the tool's own action and name. */
export type AssertMcpToolAccessParams = {
  authz?: AuthorizationContext;
  projectId: string;
  action: ProjectAction;
  toolName: string;
};
