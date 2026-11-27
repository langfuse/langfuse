import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { listScoreConfigs } from "@/src/features/public-api/server/score-configs-api-service";
import { GetScoreConfigsQuery } from "@/src/features/public-api/types/score-configs";

export const [listScoreConfigsTool, handleListScoreConfigs] = defineTool({
  name: "listScoreConfigs",
  description:
    "List score configs, newest first, including archived ones (isArchived; unusable for new scores). Each has id, name, description, dataType, minValue/maxValue (NUMERIC) and categories (CATEGORICAL, BOOLEAN). Use the id as configId in createScore or in scoreConfigIds for createAnnotationQueue.",
  action: "scoreConfigs:read",
  baseSchema: GetScoreConfigsQuery,
  inputSchema: GetScoreConfigsQuery,
  handler: async (input, context) => {
    return await runMcpTool({
      spanName: "mcp.score_configs.list",
      context,
      attributes: {
        "mcp.pagination_page": input.page,
        "mcp.pagination_limit": input.limit,
      },
      fn: async (span) => {
        const result = await listScoreConfigs({
          projectId: context.projectId,
          page: input.page,
          limit: input.limit,
        });

        span.setAttribute("mcp.result_count", result.data.length);
        return result;
      },
    });
  },
  annotations: { readOnlyHint: true },
});
