import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { updateScoreConfig } from "@/src/features/public-api/server/score-configs-api-service";
import {
  PutScoreConfigBodyWithoutArchived,
  PutScoreConfigQuery,
} from "@/src/features/public-api/types/score-configs";
import { z } from "zod";
import {
  McpScoreConfigCategoricalCategoriesSchema,
  McpScoreConfigNameSchema,
  McpScoreConfigNumericMaxValueSchema,
  McpScoreConfigNumericMinValueSchema,
  normalizeMcpScoreConfigInput,
} from "../schema";

const McpUpdateScoreConfigBaseSchema = z.object({
  configId: z.string(),
  name: McpScoreConfigNameSchema.optional(),
  numericMinValue: McpScoreConfigNumericMinValueSchema,
  numericMaxValue: McpScoreConfigNumericMaxValueSchema,
  categoricalCategories: McpScoreConfigCategoricalCategoriesSchema,
  description: z.string().optional(),
});

const UpdateScoreConfigInputSchema = PutScoreConfigQuery.and(
  PutScoreConfigBodyWithoutArchived,
);

const McpUpdateScoreConfigInputSchema = z.preprocess((input) => {
  const parsed = McpUpdateScoreConfigBaseSchema.safeParse(input);
  if (!parsed.success) return input;

  return normalizeMcpScoreConfigInput(parsed.data);
}, UpdateScoreConfigInputSchema);

export const [updateScoreConfigTool, handleUpdateScoreConfig] = defineTool({
  name: "updateScoreConfig",
  description:
    "Update a score configuration. Use this to rename, describe, or adjust allowed numeric/category fields.",
  baseSchema: McpUpdateScoreConfigBaseSchema,
  inputSchema: McpUpdateScoreConfigInputSchema,
  handler: async (input, context) => {
    return await runMcpTool({
      spanName: "mcp.score_configs.update",
      context,
      attributes: { "mcp.score_config_id": input.configId },
      fn: async () => {
        const { configId, ...body } = input;

        return await updateScoreConfig({
          context,
          configId,
          body,
        });
      },
    });
  },
  destructiveHint: true,
});
