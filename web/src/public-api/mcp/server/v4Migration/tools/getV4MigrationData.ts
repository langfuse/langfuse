import { prisma } from "@langfuse/shared/src/db";
import { z } from "zod";

import { getProjectV4MigrationData } from "@/src/migrations/v4/backend/server";
import { defineTool } from "@/src/public-api/mcp/core/define-tool";
import { runMcpTool } from "@/src/public-api/mcp/core/run-mcp-tool";

const GetV4MigrationDataInput = z.object({}).strict();

export const [getV4MigrationDataTool, handleGetV4MigrationData] = defineTool({
  name: "getV4MigrationData",
  action: "project:read",
  description:
    "Get project-specific evidence for upgrading to Langfuse v4, including SDK versions and compatibility, experiment instrumentation, legacy integrations, deprecated API usage, and trace-level evaluators. Use this before giving v4 migration guidance.",
  baseSchema: GetV4MigrationDataInput,
  inputSchema: GetV4MigrationDataInput,
  handler: async (_input, context) =>
    runMcpTool({
      spanName: "mcp.v4_migration.get",
      context,
      fn: () =>
        getProjectV4MigrationData({
          prisma,
          projectId: context.projectId,
        }),
    }),
  readOnlyHint: true,
  expensiveHint: true,
});
