import { SpanKind } from "@opentelemetry/api";
import { instrumentAsync } from "@langfuse/shared/src/server";
import { defineTool } from "../../../core/define-tool";
import { updateScoreConfig } from "@/src/features/public-api/server/score-configs-api-service";
import { PutScoreConfigQuery } from "@/src/features/public-api/types/score-configs";

export const [deleteScoreConfigTool, handleDeleteScoreConfig] = defineTool({
  name: "deleteScoreConfig",
  description:
    "Delete a score configuration from the current Langfuse project by archiving it.",
  baseSchema: PutScoreConfigQuery,
  inputSchema: PutScoreConfigQuery,
  handler: async (input, context) => {
    return await instrumentAsync(
      { name: "mcp.score_configs.delete", spanKind: SpanKind.INTERNAL },
      async (span) => {
        span.setAttributes({
          "langfuse.project.id": context.projectId,
          "langfuse.org.id": context.orgId,
          "mcp.api_key_id": context.apiKeyId,
          "mcp.score_config_id": input.configId,
        });

        return await updateScoreConfig({
          context,
          configId: input.configId,
          body: { isArchived: true },
        });
      },
    );
  },
  destructiveHint: true,
});
