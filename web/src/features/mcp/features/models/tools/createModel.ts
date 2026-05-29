import {
  PostModelsV1Body,
  PostModelsV1Response,
} from "@/src/features/public-api/types/models";
import { createModelForApi } from "@/src/features/models/server/publicApiModelService";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { z } from "zod";

const CreateModelBaseSchema = z.object({
  modelName: z.string(),
  matchPattern: z.string(),
  startDate: z.string().optional(),
  inputPrice: z.number().nonnegative().optional(),
  outputPrice: z.number().nonnegative().optional(),
  totalPrice: z.number().nonnegative().optional(),
  unit: z.enum([
    "TOKENS",
    "CHARACTERS",
    "MILLISECONDS",
    "SECONDS",
    "REQUESTS",
    "IMAGES",
  ]),
  tokenizerId: z.enum(["openai", "claude"]).optional(),
  tokenizerConfig: z.any().optional(),
  pricingTiers: z.array(z.any()).optional(),
});

export const [createModelTool, handleCreateModel] = defineTool({
  name: "createModel",
  description:
    "Create a custom model definition for cost tracking/tokenization in the current project.",
  baseSchema: CreateModelBaseSchema,
  inputSchema: PostModelsV1Body,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.models.create",
      context,
      attributes: { "mcp.model_name": input.modelName },
      fn: async () => {
        const result = await createModelForApi({
          projectId: context.projectId,
          input,
          auditScope: context,
        });

        return PostModelsV1Response.parse(result);
      },
    }),
});
