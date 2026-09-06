import {
  EvalOutputDefinitionSchema,
  EvalTemplateType,
  EvaluatorPromptMessagesSchema,
  extractVariables,
  EvaluatorSourceCodeLanguage,
  InvalidRequestError,
  PersistedEvalOutputDefinitionSchema,
  ZodModelConfig,
  jsonSchema,
  paginationLimitZod,
  singleFilter,
  type ObservationVariableMapping,
  type PersistedEvaluatorPromptMessages,
} from "@langfuse/shared";
import { z } from "zod";

const EvaluatorMetadataSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().max(2_000).nullable(),
});

const EvaluatorVersionBaseSchema = z.object({
  variableMapping: jsonSchema.nullable(),
});

const decodeEvaluatorVersionCursor = (value: string) => {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf-8"));
  } catch (_error) {
    throw new InvalidRequestError("Invalid cursor format");
  }
};

const EvaluatorVersionCursorSchema = z
  .string()
  .describe("Base64url-encoded cursor for pagination")
  .transform(decodeEvaluatorVersionCursor)
  .pipe(
    z.object({
      v: z.literal(1),
      version: z.number().int().positive(),
    }),
  );

export type EvaluatorVersionCursor = z.infer<
  typeof EvaluatorVersionCursorSchema
>;

export const encodeEvaluatorVersionCursor = (cursor: EvaluatorVersionCursor) =>
  Buffer.from(JSON.stringify(cursor)).toString("base64url");

const LlmEvaluatorDefinitionSchema = EvaluatorVersionBaseSchema.extend({
  type: z.literal(EvalTemplateType.LLM_AS_JUDGE),
  promptMessages: EvaluatorPromptMessagesSchema,
  provider: z.string().nullable(),
  model: z.string().nullable(),
  modelParams: ZodModelConfig.nullable(),
  vars: z.array(z.string()),
  outputDefinition: PersistedEvalOutputDefinitionSchema,
});

export const CodeEvaluatorDefinitionSchema = z.object({
  type: z.literal(EvalTemplateType.CODE),
  sourceCode: z.string().min(1).max(262_144),
  sourceCodeLanguage: z.enum(EvaluatorSourceCodeLanguage),
  variableMapping: z.never().optional(),
});

export const EvaluatorDefinitionSchema = z.discriminatedUnion("type", [
  LlmEvaluatorDefinitionSchema,
  CodeEvaluatorDefinitionSchema,
]);

export const EvaluatorModelConfigSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  modelParams: ZodModelConfig.nullable().optional(),
});

const LlmEvaluatorDefinitionInputSchema = EvaluatorVersionBaseSchema.extend({
  type: z.literal(EvalTemplateType.LLM_AS_JUDGE),
  promptMessages: EvaluatorPromptMessagesSchema,
  modelConfig: EvaluatorModelConfigSchema.nullable(),
  outputDefinition: EvalOutputDefinitionSchema,
});

export const EvaluatorDefinitionInputSchema = z
  .discriminatedUnion("type", [
    LlmEvaluatorDefinitionInputSchema,
    CodeEvaluatorDefinitionSchema,
  ])
  .transform(
    (definition): z.infer<typeof EvaluatorDefinitionSchema> =>
      definition.type === EvalTemplateType.CODE
        ? definition
        : {
            type: EvalTemplateType.LLM_AS_JUDGE,
            promptMessages: definition.promptMessages,
            provider: definition.modelConfig?.provider ?? null,
            model: definition.modelConfig?.model ?? null,
            modelParams: definition.modelConfig?.modelParams ?? null,
            vars: [
              ...new Set(
                definition.promptMessages.flatMap(({ content }) =>
                  extractVariables(content),
                ),
              ),
            ],
            variableMapping: definition.variableMapping,
            outputDefinition: definition.outputDefinition,
          },
  );

export const CreateEvaluatorSchema = EvaluatorMetadataSchema.extend({
  projectId: z.string(),
  evaluatorId: z.uuid().optional(),
  definition: EvaluatorDefinitionInputSchema,
});

export const UpdateEvaluatorSchema = EvaluatorMetadataSchema.extend({
  projectId: z.string(),
  evaluatorId: z.string(),
  definition: EvaluatorDefinitionInputSchema,
});

export const EvaluatorIdSchema = z.object({
  projectId: z.string(),
  evaluatorId: z.string(),
});

export const EvaluatorVersionsSchema = EvaluatorIdSchema.extend({
  cursor: EvaluatorVersionCursorSchema.optional(),
  limit: paginationLimitZod.optional().default(50),
});

export const EvaluatorIdsSchema = z.object({
  projectId: z.string(),
  evaluatorIds: z.array(z.string()).min(1).max(100),
});

export const ActivationCostEstimatesSchema = EvaluatorIdsSchema.extend({
  filter: z.array(singleFilter),
  sampling: z.number().min(0).max(1),
  shouldRunMissingTest: z.boolean().optional().default(true),
  knownTestRunCostUsd: z.number().nonnegative().optional(),
}).refine(
  ({ evaluatorIds }) => new Set(evaluatorIds).size === evaluatorIds.length,
  { message: "Evaluator IDs must be unique", path: ["evaluatorIds"] },
);

const EvaluatorListFilterSchema = z
  .array(singleFilter)
  .superRefine((filters, ctx) => {
    for (const [index, filter] of filters.entries()) {
      const valid =
        (["name", "creator", "model"].includes(filter.column) &&
          (filter.type === "string" || filter.type === "stringOptions")) ||
        (["status", "type"].includes(filter.column) &&
          filter.type === "stringOptions");
      const validOptions =
        filter.type !== "stringOptions" ||
        (filter.column === "status"
          ? filter.value.every((value) =>
              ["ACTIVE", "INACTIVE", "BLOCKED"].includes(value),
            )
          : filter.column === "type"
            ? filter.value.every((value) =>
                Object.values(EvalTemplateType).includes(
                  value as EvalTemplateType,
                ),
              )
            : filter.column === "name" ||
              filter.column === "creator" ||
              filter.column === "model");
      if (!valid || !validOptions) {
        ctx.addIssue({
          code: "custom",
          message: `Unsupported evaluator filter: ${filter.column}`,
          path: [index],
        });
      }
    }
  })
  .optional();

export const DeleteEvaluatorsSchema = z.union([
  EvaluatorIdsSchema,
  z.object({
    projectId: z.string(),
    isBatchAction: z.literal(true),
    search: z.string().trim().max(200).optional(),
    filter: EvaluatorListFilterSchema,
  }),
]);

export const ListEvaluatorsSchema = z.object({
  projectId: z.string(),
  page: z.number().int().positive().default(1),
  limit: paginationLimitZod.optional().default(50),
  orderBy: z
    .object({
      column: z.enum(["name", "type", "createdAt", "updatedAt"]),
      order: z.enum(["ASC", "DESC"]),
    })
    .optional(),
  search: z.string().trim().max(200).optional(),
  filter: EvaluatorListFilterSchema,
});

export const ListEvaluatorGallerySchema = z.object({
  projectId: z.string(),
  cursor: z
    .object({
      createdAt: z.date(),
      id: z.string(),
    })
    .optional(),
  limit: paginationLimitZod.optional().default(50),
  search: z.string().trim().max(200).optional(),
});

export const EvaluatorOptionsSchema = z.object({
  projectId: z.string(),
  search: z.string().trim().max(200).optional(),
  limit: paginationLimitZod.optional().default(50),
  excludeLegacyEvaluators: z.boolean().optional().default(false),
});

/** Input for both the name and the description suggestion procedures. */
export const SuggestEvaluatorTextSchema = z.object({
  projectId: z.string(),
  definition: z.discriminatedUnion("type", [
    z.object({
      type: z.literal(EvalTemplateType.LLM_AS_JUDGE),
      promptMessages: EvaluatorPromptMessagesSchema,
    }),
    z.object({
      type: z.literal(EvalTemplateType.CODE),
      sourceCode: z.string().min(1),
    }),
  ]),
});

export type EvaluatorDefinition = z.infer<typeof EvaluatorDefinitionSchema>;
export type NormalizedEvaluatorDefinition = EvaluatorDefinition;
export type EvaluatorDefinitionForPersistence =
  | (Extract<EvaluatorDefinition, { type: "LLM_AS_JUDGE" }> & {
      prompt: string;
      promptMessages: PersistedEvaluatorPromptMessages;
    })
  | (Omit<Extract<EvaluatorDefinition, { type: "CODE" }>, "variableMapping"> & {
      variableMapping: ObservationVariableMapping[];
    });
export type CreateEvaluatorInput = z.infer<typeof CreateEvaluatorSchema>;
export type UpdateEvaluatorInput = z.infer<typeof UpdateEvaluatorSchema>;
export type PatchEvaluatorInput = Pick<
  UpdateEvaluatorInput,
  "projectId" | "evaluatorId"
> &
  Partial<Pick<UpdateEvaluatorInput, "name" | "description" | "definition">>;
export type DeleteEvaluatorsInput = z.infer<typeof DeleteEvaluatorsSchema>;
export type EvaluatorListOrderBy = z.infer<
  typeof ListEvaluatorsSchema
>["orderBy"];
