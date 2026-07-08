import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { getScoreConfig } from "@/src/features/public-api/server/score-configs-api-service";
import { GetScoreConfigQuery } from "@/src/features/public-api/types/score-configs";

export const [getScoreConfigTool, handleGetScoreConfig] = defineTool({
  name: "getScoreConfig",
  description:
    "Fetch one score configuration by ID from the current Langfuse project. Returns the public score config object directly.",
  baseSchema: GetScoreConfigQuery,
  inputSchema: GetScoreConfigQuery,
  handler: async (input, context) => {
    return await runMcpTool({
      spanName: "mcp.score_configs.get",
      context,
      attributes: { "mcp.score_config_id": input.configId },
      fn: async () => {
        return await getScoreConfig({
          projectId: context.projectId,
          configId: input.configId,
        });
      },
    });
  },
  readOnlyHint: true,
});
