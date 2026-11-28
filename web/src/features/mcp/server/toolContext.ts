import {
  ProtocolError,
  ProtocolErrorCode,
  type Tool,
} from "@modelcontextprotocol/server";

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

/** projectIdArgument is the argument every project tool accepts to name its project. */
export const projectIdArgument = "projectId";

/** projectIdArgumentDescription documents projectIdArgument in each project tool's input schema. */
const projectIdArgumentDescription =
  "ID of the project to run this tool in. Take it from a Langfuse URL (`/project/<projectId>/...`) when the user gives one; otherwise call listProjects and match the project's name, and ask the user if more than one matches.";

/** withProjectIdArgument adds the required projectId argument to a project tool's input schema. */
export function withProjectIdArgument(
  schema: Tool["inputSchema"],
): Tool["inputSchema"] {
  return {
    ...schema,
    properties: {
      ...schema.properties,
      [projectIdArgument]: {
        type: "string",
        description: projectIdArgumentDescription,
      },
    },
    required: [...(schema.required ?? []), projectIdArgument],
  };
}

/** resolveToolContext resolves the project a tool call runs in and authorizes the tool's action on it. */
export function resolveToolContext(
  connection: McpConnection,
  action: Action,
  requestedProjectId: string | undefined,
): ServerContext {
  const projectId = requireProjectId(connection, requestedProjectId);
  const org = requireOwningOrganization(connection, projectId);
  authorizeProject(connection, org, action, projectId);
  return toServerContext(connection, org, projectId);
}

/** requireProjectId picks the requested project, else the key's bound project. */
function requireProjectId(
  connection: McpConnection,
  requestedProjectId: string | undefined,
): string {
  const projectId = requestedProjectId ?? connection.boundProjectId;
  if (projectId) return projectId;
  throw new ProtocolError(
    ProtocolErrorCode.InvalidParams,
    "This API key is not bound to a project. Pass `projectId`, or call `listProjects` to find one.",
  );
}

/** requireOwningOrganization finds the principal's organization that owns projectId. */
function requireOwningOrganization(
  connection: McpConnection,
  projectId: string,
): PrincipalOrganization {
  const org = organizationsOf(connection).find((o) =>
    o.projectIds.includes(projectId),
  );
  if (org) return org;
  throwAuthorizationError(
    new ForbiddenError(
      "Project not found or this API key has no access to it.",
    ),
  );
}

/** authorizeProject authorizes action on projectId within the organization that owns it. */
function authorizeProject(
  connection: McpConnection,
  org: PrincipalOrganization,
  action: Action,
  projectId: string,
): void {
  // The owning org, not the key's bound org, keeps a project/* policy inside its tenant.
  const decision = authorize(
    connection.auth,
    OrganizationId(org.orgId),
    action,
    ProjectId(projectId),
  );
  if (!decision.success) throwAuthorizationError(decision.error);
}

/** toServerContext binds the connection to projectId and its organization's plan. */
function toServerContext(
  connection: McpConnection,
  org: PrincipalOrganization,
  projectId: string,
): ServerContext {
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

/** throwAuthorizationError reports a denial as an MCP protocol error. */
function throwAuthorizationError(error: unknown): never {
  const { code, message } = formatErrorForUser(error);
  throw new ProtocolError(code, message);
}

/** organizationsOf lists the organizations the connection's principal belongs to. */
export function organizationsOf(
  connection: McpConnection,
): PrincipalOrganization[] {
  const { principal } = connection.auth;
  if ("organizations" in principal) return principal.organizations;
  return [];
}

/** isProjectAction reports whether a tool runs in a project rather than on the bare connection. */
export const isProjectAction = (action: ApiAction): action is Action =>
  action !== __dangerouslySkipAuthz;

/** splitProjectId separates the projectId argument from the tool's own input. */
export function splitProjectId(args: Record<string, unknown> | undefined): {
  projectId: string | undefined;
  input: Record<string, unknown> | undefined;
} {
  if (!args || !(projectIdArgument in args)) {
    return { projectId: undefined, input: args };
  }
  const { [projectIdArgument]: projectId, ...input } = args;
  if (typeof projectId !== "string" || projectId.length === 0) {
    throw new ProtocolError(
      ProtocolErrorCode.InvalidParams,
      "`projectId` must be a non-empty string.",
    );
  }
  return { projectId, input };
}
