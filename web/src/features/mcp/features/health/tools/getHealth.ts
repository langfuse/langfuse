import { z } from "zod";
import { runHealthCheck } from "@/src/features/public-api/server/health-service";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

const HealthInputSchema = z.object({
  failIfDatabaseUnavailable: z.boolean().optional().default(false),
  failIfNoRecentEvents: z.boolean().optional().default(false),
});

const HealthResponseSchema = z
  .object({
    status: z.string(),
    version: z.string(),
  })
  .strict();

export const [getHealthTool, handleGetHealth] = defineTool({
  name: "getHealth",
  description:
    "Check Langfuse API health. Optionally verify database availability and recent trace/observation ingestion.",
  baseSchema: HealthInputSchema,
  inputSchema: HealthInputSchema,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.health.get",
      context,
      fn: async () => {
        const result = await runHealthCheck(input);
        return HealthResponseSchema.parse({
          status: result.status,
          version: result.version,
        });
      },
    }),
  readOnlyHint: true,
});
