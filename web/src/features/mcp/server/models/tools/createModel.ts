import {
  PostModelsV1Body,
  PostModelsV1Response,
} from "@/src/features/public-api/types/models";
import { createModelForApi } from "@/src/features/models/server/publicApiModelService";
import { defineTool } from "../../../core/define-tool";
import { buildModelUrl } from "@langfuse/shared/src/server";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { z } from "zod";

/**
 * JSON Schema facing shape of one pricing tier condition. Union-free with all
 * fields optional because MCP tool input schemas must serialize to a plain
 * object schema; the runtime schema enforces one of the two condition shapes.
 */
const PricingTierConditionBaseSchema = z.object({
  usageDetailPattern: z
    .string()
    .optional()
    .describe("Usage condition: regex on usage detail keys, e.g. '^input'."),
  operator: z
    .enum(["gt", "gte", "lt", "lte", "eq", "neq", "in"])
    .optional()
    .describe(
      "gt/gte/lt/lte/eq/neq compare the summed usage of matching keys; attribute conditions use 'in'.",
    ),
  value: z
    .number()
    .nonnegative()
    .optional()
    .describe("Usage threshold, e.g. 200000."),
  caseSensitive: z.boolean().optional().describe("Default false."),
  source: z.enum(["model_parameters", "metadata"]).optional(),
  key: z.string().optional(),
  values: z
    .array(z.string())
    .optional()
    .describe("Attribute condition matches if the value is in this list."),
});

const PricingTierBaseSchema = z.object({
  name: z.string().describe("Unique within the model."),
  isDefault: z
    .boolean()
    .optional()
    .describe(
      "Exactly one tier is the default, with priority 0 and no conditions.",
    ),
  priority: z
    .number()
    .int()
    .min(0)
    .max(999)
    .describe(
      "Unique. Non-default tiers are tried lowest first; the first whose conditions all match wins, else the default.",
    ),
  conditions: z
    .array(PricingTierConditionBaseSchema)
    .describe(
      "Empty for the default tier, else at least one. Each is {usageDetailPattern, operator, value, caseSensitive?} or {source, key, operator: 'in', values}.",
    ),
  prices: z
    .record(z.string(), z.number().nonnegative())
    .describe(
      "USD per unit by usage type, e.g. {input: 0.000003, output: 0.000015}.",
    ),
});

const CreateModelBaseSchema = z.object({
  modelName: z
    .string()
    .describe("Must be unique among the project's custom models."),
  matchPattern: z
    .string()
    .describe(
      "Postgres regex on the observation's model name, e.g. '(?i)^(my-model)$'.",
    ),
  startDate: z
    .string()
    .optional()
    .describe("ISO 8601 date; applies only to observations starting after it."),
  inputPrice: z
    .number()
    .nonnegative()
    .optional()
    .describe("USD per input unit, e.g. 0.000003."),
  outputPrice: z
    .number()
    .nonnegative()
    .optional()
    .describe("USD per output unit."),
  totalPrice: z
    .number()
    .nonnegative()
    .optional()
    .describe(
      "USD per unit of total usage; only without inputPrice/outputPrice.",
    ),
  unit: z.enum([
    "TOKENS",
    "CHARACTERS",
    "MILLISECONDS",
    "SECONDS",
    "REQUESTS",
    "IMAGES",
  ]),
  tokenizerId: z
    .enum(["openai", "claude"])
    .optional()
    .describe("Legacy; ingestion does not infer usage from content."),
  tokenizerConfig: z
    .any()
    .optional()
    .describe("Legacy; ingestion does not infer usage from content."),
  pricingTiers: z
    .array(PricingTierBaseSchema)
    .optional()
    .describe(
      "Alternative to flat prices, for usage- or attribute-dependent pricing.",
    ),
});

export const [createModelTool, handleCreateModel] = defineTool({
  name: "createModel",
  description:
    "Create a custom model price definition; returns it with id and url. Observations whose model name matches matchPattern get costs at ingestion (existing costs are not recalculated); custom models take precedence over Langfuse-managed ones. Check listModels for an existing match first. Give flat prices (inputPrice/outputPrice or totalPrice) or pricingTiers, not both.",
  action: "models:CUD",
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

        const model = PostModelsV1Response.parse(result);

        return {
          ...model,
          url: buildModelUrl({
            projectId: context.projectId,
            modelId: model.id,
          }),
        };
      },
    }),
  annotations: { destructiveHint: false },
});
