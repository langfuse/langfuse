import { z } from "zod";

import { prisma } from "@langfuse/shared/src/db";
import { OrganizationId, ProjectId } from "@langfuse/shared/rbac";
import { authorize } from "@/src/features/rbac/authorize";
import { __dangerouslySkipAuthz } from "@/src/features/public-api/server/enforceAuth";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import type { McpConnection } from "../../../types";
import { organizationsOf } from "../../toolContext";

const listProjectsInput = z.object({}).strict();

/** listProjectsTool lists the projects an API key can read, for picking a tool call's projectId. */
export const [listProjectsTool, handleListProjects] = defineTool({
  name: "listProjects",
  // Runs in no project: it authorizes project:read on each project it lists.
  action: __dangerouslySkipAuthz,
  description:
    "List the projects this API key can access, as id and name. Pass a project's id as `projectId` to run other tools in it.",
  baseSchema: listProjectsInput,
  inputSchema: listProjectsInput,
  handler: async (_input, connection: McpConnection) =>
    runMcpTool({
      spanName: "mcp.projects.list",
      context: connection,
      fn: () => listReadableProjects(connection),
    }),
  annotations: { readOnlyHint: true },
});

/** listReadableProjects loads the id and name of every readable, undeleted project. */
async function listReadableProjects(connection: McpConnection) {
  const projects = await prisma.project.findMany({
    where: { id: { in: readableProjectIds(connection) }, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return { projects };
}

/** readableProjectIds lists the projects of the principal's organizations it may read. */
function readableProjectIds(connection: McpConnection): string[] {
  return organizationsOf(connection).flatMap((org) =>
    org.projectIds.filter((projectId) =>
      canReadProject(connection, org.orgId, projectId),
    ),
  );
}

/** canReadProject reports whether the connection holds project:read on projectId. */
function canReadProject(
  connection: McpConnection,
  orgId: string,
  projectId: string,
): boolean {
  return authorize(
    connection.auth,
    OrganizationId(orgId),
    "project:read",
    ProjectId(projectId),
  ).success;
}
