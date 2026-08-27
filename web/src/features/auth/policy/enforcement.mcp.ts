import { type IncomingHttpHeaders } from "http";

import {
  ForbiddenError,
  type InternalServerError,
  type UnauthorizedError,
} from "@langfuse/shared";

import { authorize } from "./authorize";
import { authenticate } from "./identity";
import {
  type AuthorizationContext,
  type Decision,
  type ErrorResult,
  type ProjectAction,
  type Success,
} from "./types";

/** mcpAccessAction is the connection-level action every MCP credential must hold. */
export const mcpAccessAction: ProjectAction = "mcp:access";

/** enforceMcpAccess runs the header-free MCP connection PEP — authenticate, resolve the bound project, assert mcp:access — returning every outcome as a value. */
export async function enforceMcpAccess(
  params: EnforceMcpAccessParams,
): Promise<McpAccessResult | ErrorResult<McpAuthError>> {
  const authn = await authenticate({
    headers: params.headers,
    allowInAppAgentKey: true,
  });
  if (!authn.success) return authn;

  const context = authn.context;
  const projectId = boundProjectIdOf(context);
  if (!projectId) {
    return {
      success: false,
      error: new ForbiddenError(
        "Access denied: MCP requires project-scoped API keys with BasicAuth",
      ),
    };
  }

  const decision = authorize(context, mcpAccessAction, { projectId });
  if (!decision.success) return { success: false, error: decision.error };
  return { success: true, context, projectId };
}

/** authorizeMcpTool asserts a per-tool action against an already-resolved MCP context, header-free. */
export function authorizeMcpTool(
  context: AuthorizationContext,
  action: ProjectAction,
  projectId: string,
): Decision {
  return authorize(context, action, { projectId });
}

/** boundProjectIdOf returns the project an MCP api key is bound to, when any. */
function boundProjectIdOf(context: AuthorizationContext): string | undefined {
  if (context.principal.kind !== "apiKey") return undefined;
  const bound = context.principal.boundResource;
  return bound && "projectId" in bound ? bound.projectId : undefined;
}

/** EnforceMcpAccessParams is the request headers the connection PEP authenticates. */
export type EnforceMcpAccessParams = {
  headers: IncomingHttpHeaders;
};

/** McpAccessResult is the connection PEP's success outcome: the resolved context and bound project. */
export type McpAccessResult = Success & {
  context: AuthorizationContext;
  projectId: string;
};

/** McpAuthError is any typed failure the MCP connection PEP surfaces. */
export type McpAuthError =
  | UnauthorizedError
  | InternalServerError
  | ForbiddenError;

/** __test exposes module-private helpers for the colocated unit test. */
export const __test = { boundProjectIdOf };
