import { SpanKind } from "@opentelemetry/api";
import { instrumentAsync } from "@langfuse/shared/src/server";
import { defineTool } from "../../../core/define-tool";
import { getScoreConfig } from "@/src/features/public-api/server/score-configs-api-service";
import { GetScoreConfigQuery } from "@/src/features/public-api/types/score-configs";

export const [getScoreConfigTool, handleGetScoreConfig] = defineTool({
  name: "getScoreConfig",
  description:
    "Fetch one score configuration by ID from the current Langfuse project. Returns the public score config object directly.",
  baseSchema: GetScoreConfigQuery,
  inputSchema: GetScoreConfigQuery,
  handler: async (input, context) => {
    return await instrumentAsync(
      { name: "mcp.score_configs.get", spanKind: SpanKind.INTERNAL },
      async (span) => {
        span.setAttributes({
          "langfuse.project.id": context.projectId,
          "langfuse.org.id": context.orgId,
          "mcp.api_key_id": context.apiKeyId,
          "mcp.score_config_id": input.configId,
        });

        return await getScoreConfig({
          projectId: context.projectId,
          configId: input.configId,
        });
      },
    );
  },
  readOnlyHint: true,
});
