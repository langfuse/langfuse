/**
 * Per-call project resolution for the MCP server.
 *
 * A connection is authenticated once per request; the project a tool runs in
 * is resolved per call, so an organization key can work across the projects
 * of its organization. Every project tool accepts an optional `projectId`
 * argument, which falls back to the project a project-scoped key is bound to.
 */

import { ProtocolError, ProtocolErrorCode } from "@modelcontextprotocol/server";
import { ForbiddenError } from "@langfuse/shared";
import { OrganizationId, ProjectId, type Action } from "@langfuse/shared/rbac";

import { authorize } from "@/src/features/rbac/authorize";
import { type PrincipalOrganization } from "@/src/features/auth/policy/types";
import {
  __dangerouslySkipAuthz,
  type ApiAction,
} from "@/src/features/public-api/server/enforceAuth";
import { formatErrorForUser } from "../core/error-formatting";
import type { McpConnection, ServerContext } from "../types";

/** PROJECT_ID_ARGUMENT is the argument every project tool accepts to name its project. */
export const PROJECT_ID_ARGUMENT = "projectId";

/** projectIdArgumentDescription documents PROJECT_ID_ARGUMENT in each project tool's input schema. */
export const projectIdArgumentDescription =
  "ID of the project to run this tool in. Required for API keys that are not bound to a project; call listProjects to find it. Defaults to the key's own project.";

/** isProjectAction reports whether a tool runs in a project; tools that skip authz (getHealth, listProjects) run on the connection alone. */
export const isProjectAction = (action: ApiAction): action is Action =>
  action !== __dangerouslySkipAuthz;

/** splitProjectId separates the projectId argument from the tool's own input, so strict input schemas never see it. */
export function splitProjectId(args: Record<string, unknown> | undefined): {
  projectId: string | undefined;
  input: Record<string, unknown> | undefined;
} {
  if (!args || !(PROJECT_ID_ARGUMENT in args)) {
    return { projectId: undefined, input: args };
  }
  const { [PROJECT_ID_ARGUMENT]: projectId, ...input } = args;
  if (typeof projectId !== "string" || projectId.length === 0) {
    throw new ProtocolError(
      ProtocolErrorCode.InvalidParams,
      "`projectId` must be a non-empty string.",
    );
  }
  return { projectId, input };
}

/** resolveToolContext resolves the project a tool call runs in and authorizes the tool's action on it. */
export function resolveToolContext(
  connection: McpConnection,
  action: Action,
  requestedProjectId: string | undefined,
): ServerContext {
  const projectId = requestedProjectId ?? connection.boundProjectId;
  if (!projectId) {
    throw new ProtocolError(
      ProtocolErrorCode.InvalidParams,
      "This API key is not bound to a project. Pass `projectId`, or call `listProjects` to find one.",
    );
  }

  const org = owningOrganization(connection, projectId);
  if (!org) {
    throwAuthorizationError(
      new ForbiddenError(
        "Project not found or this API key has no access to it.",
      ),
    );
  }

  const decision = authorize(
    connection.auth,
    OrganizationId(org.orgId),
    action,
    ProjectId(projectId),
  );
  if (!decision.success) throwAuthorizationError(decision.error);

  return {
    ...connection,
    projectId,
    orgId: org.orgId,
    accessLevel: "project",
    plan: org.plan,
    rateLimitOverrides: org.rateLimitOverrides,
    accessAuditLogEnabled: org.accessAuditLogEnabled ?? false,
  };
}

/** organizationsOf lists the organizations the connection's principal belongs to. */
export function organizationsOf(
  connection: McpConnection,
): PrincipalOrganization[] {
  const { principal } = connection.auth;
  return "organizations" in principal ? principal.organizations : [];
}

/** owningOrganization is the principal's organization that owns projectId. It is the tenant a project is authorized in: the key's bound organization would let an organization key's project/* policy match a project of another organization. */
function owningOrganization(
  connection: McpConnection,
  projectId: string,
): PrincipalOrganization | undefined {
  return organizationsOf(connection).find((org) =>
    org.projectIds.includes(projectId),
  );
}

/** throwAuthorizationError reports a denial as an MCP protocol error. */
function throwAuthorizationError(error: unknown): never {
  const { code, message } = formatErrorForUser(error);
  throw new ProtocolError(code, message);
}
