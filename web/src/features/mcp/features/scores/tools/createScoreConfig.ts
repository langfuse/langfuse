import { SpanKind } from "@opentelemetry/api";
import { instrumentAsync } from "@langfuse/shared/src/server";
import { defineTool } from "../../../core/define-tool";
import { createScoreConfig } from "@/src/features/public-api/server/score-configs-api-service";
import { PostScoreConfigBody } from "@/src/features/public-api/types/score-configs";
import { z } from "zod";
import { McpScoreConfigNameSchema } from "../schema";

const CreateScoreConfigInputSchema = z
  .object({
    name: McpScoreConfigNameSchema,
  })
  .and(PostScoreConfigBody);

export const [createScoreConfigTool, handleCreateScoreConfig] = defineTool({
  name: "createScoreConfig",
  description:
    "Create a score configuration in the current Langfuse project. Supports numeric, categorical, boolean, and text configs. Boolean configs automatically receive True and False categories.",
  baseSchema: CreateScoreConfigInputSchema,
  inputSchema: CreateScoreConfigInputSchema,
  handler: async (input, context) => {
    return await instrumentAsync(
      { name: "mcp.score_configs.create", spanKind: SpanKind.INTERNAL },
      async (span) => {
        span.setAttributes({
          "langfuse.project.id": context.projectId,
          "langfuse.org.id": context.orgId,
          "mcp.api_key_id": context.apiKeyId,
          "mcp.score_config_name": input.name,
          "mcp.score_config_data_type": input.dataType,
        });

        const config = await createScoreConfig({
          context,
          body: input,
        });

        span.setAttribute("mcp.score_config_id", config.id);
        return config;
      },
    );
  },
  destructiveHint: true,
});
