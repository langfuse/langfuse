import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { updateScoreConfig } from "@/src/features/public-api/server/score-configs-api-service";
import { PutScoreConfigQuery } from "@/src/features/public-api/types/score-configs";

export const [deleteScoreConfigTool, handleDeleteScoreConfig] = defineTool({
  name: "deleteScoreConfig",
  description:
    "Delete a score configuration from the current Langfuse project by archiving it.",
  baseSchema: PutScoreConfigQuery,
  inputSchema: PutScoreConfigQuery,
  handler: async (input, context) => {
    return await runMcpTool({
      spanName: "mcp.score_configs.delete",
      context,
      attributes: { "mcp.score_config_id": input.configId },
      fn: async () => {
        return await updateScoreConfig({
          context,
          configId: input.configId,
          body: { isArchived: true },
        });
      },
    });
  },
  destructiveHint: true,
});
