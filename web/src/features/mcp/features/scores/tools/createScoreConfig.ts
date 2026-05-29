import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { createScoreConfig } from "@/src/features/public-api/server/score-configs-api-service";
import { PostScoreConfigBody } from "@/src/features/public-api/types/score-configs";
import { z } from "zod";
import {
  McpScoreConfigCategoricalCategoriesSchema,
  McpScoreConfigNameSchema,
  McpScoreConfigNumericMaxValueSchema,
  McpScoreConfigNumericMinValueSchema,
  normalizeMcpScoreConfigInput,
} from "../schema";

const CreateScoreConfigBaseSchema = z.object({
  name: McpScoreConfigNameSchema,
  description: z.string().optional(),
  dataType: z
    .enum(["NUMERIC", "CATEGORICAL", "BOOLEAN", "TEXT"])
    .describe(
      "Score config type. Numeric range fields only apply to NUMERIC configs; categorical categories only apply to CATEGORICAL configs.",
    ),
  numericMinValue: McpScoreConfigNumericMinValueSchema,
  numericMaxValue: McpScoreConfigNumericMaxValueSchema,
  categoricalCategories: McpScoreConfigCategoricalCategoriesSchema,
});

const CreateScoreConfigInputSchema = z.preprocess((input) => {
  const parsed = CreateScoreConfigBaseSchema.safeParse(input);
  if (!parsed.success) return input;

  return normalizeMcpScoreConfigInput(parsed.data);
}, PostScoreConfigBody);

export const [createScoreConfigTool, handleCreateScoreConfig] = defineTool({
  name: "createScoreConfig",
  description:
    "Create a score configuration. Supports numeric, categorical, boolean, and text configs. Boolean configs automatically receive True and False categories.",
  baseSchema: CreateScoreConfigBaseSchema,
  inputSchema: CreateScoreConfigInputSchema,
  destructiveHint: true,
  handler: async (input, context) => {
    return await runMcpTool({
      spanName: "mcp.score_configs.create",
      context,
      attributes: {
        "mcp.score_config_name": input.name,
        "mcp.score_config_data_type": input.dataType,
      },
      fn: async (span) => {
        const config = await createScoreConfig({
          context,
          body: input,
        });

        span.setAttribute("mcp.score_config_id", config.id);
        return config;
      },
    });
  },
});
