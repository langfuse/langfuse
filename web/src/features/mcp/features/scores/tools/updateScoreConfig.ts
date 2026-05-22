import { SpanKind } from "@opentelemetry/api";
import { instrumentAsync } from "@langfuse/shared/src/server";
import { defineTool } from "../../../core/define-tool";
import { updateScoreConfig } from "@/src/features/public-api/server/score-configs-api-service";
import {
  PutScoreConfigBodyWithoutArchived,
  PutScoreConfigQuery,
} from "@/src/features/public-api/types/score-configs";
import { z } from "zod";
import { McpScoreConfigNameSchema } from "../schema";

const UpdateScoreConfigInputSchema = PutScoreConfigQuery.and(
  PutScoreConfigBodyWithoutArchived,
);

const McpUpdateScoreConfigInputSchema = z
  .object({
    name: McpScoreConfigNameSchema.optional(),
  })
  .and(UpdateScoreConfigInputSchema);

export const [updateScoreConfigTool, handleUpdateScoreConfig] = defineTool({
  name: "updateScoreConfig",
  description:
    "Update a score configuration in the current Langfuse project. Use this to rename, describe, or adjust allowed numeric/category fields.",
  baseSchema: McpUpdateScoreConfigInputSchema,
  inputSchema: McpUpdateScoreConfigInputSchema,
  handler: async (input, context) => {
    return await instrumentAsync(
      { name: "mcp.score_configs.update", spanKind: SpanKind.INTERNAL },
      async (span) => {
        const { configId, ...body } = input;
        span.setAttributes({
          "langfuse.project.id": context.projectId,
          "langfuse.org.id": context.orgId,
          "mcp.api_key_id": context.apiKeyId,
          "mcp.score_config_id": configId,
        });

        return await updateScoreConfig({
          context,
          configId,
          body,
        });
      },
    );
  },
  destructiveHint: true,
});
