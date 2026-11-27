import { z } from "zod";
import { prisma } from "@langfuse/shared/src/db";
import { OrganizationId, ProjectId } from "@langfuse/shared/rbac";

import { authorize } from "@/src/features/rbac/authorize";
import { __dangerouslySkipAuthz } from "@/src/features/public-api/server/enforceAuth";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import type { McpConnection } from "../../../types";
import { organizationsOf } from "../../toolContext";

const ListProjectsInput = z.object({}).strict();

export const [listProjectsTool, handleListProjects] = defineTool({
  name: "listProjects",
  // Runs in no project: it authorizes project:read on each project it lists.
  action: __dangerouslySkipAuthz,
  description:
    "List the projects this API key can access, as id and name. Pass a project's id as `projectId` to run other tools in it.",
  baseSchema: ListProjectsInput,
  inputSchema: ListProjectsInput,
  handler: async (_input, connection: McpConnection) =>
    runMcpTool({
      spanName: "mcp.projects.list",
      context: connection,
      fn: async () => {
        const projects = await prisma.project.findMany({
          where: {
            id: { in: readableProjectIds(connection) },
            deletedAt: null,
          },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        });
        return { projects };
      },
    }),
  annotations: { readOnlyHint: true },
});

/** readableProjectIds lists the projects of the principal's organizations it may read. */
function readableProjectIds(connection: McpConnection): string[] {
  return organizationsOf(connection).flatMap((org) =>
    org.projectIds.filter(
      (projectId) =>
        authorize(
          connection.auth,
          OrganizationId(org.orgId),
          "project:read",
          ProjectId(projectId),
        ).success,
    ),
  );
}
