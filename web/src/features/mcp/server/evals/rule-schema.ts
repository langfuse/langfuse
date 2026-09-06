import { z } from "zod";
import {
  CreateRuleSchema,
  ListRulesSchema,
  RuleAssignmentInputSchema,
  RuleIdSchema,
  RuleMetadataSchema,
  SetRuleEnabledSchema,
  UpdateRuleSchema,
} from "@/src/features/evals/v2/server/rules/ruleTypes";
import {
  ObservationPromptVariableMappingInput,
  PromptVariableMappingRead,
  PublicEvaluatorType,
} from "@/src/features/public-api/server";
import { McpAdvancedFilterBaseSchema } from "../../core/filter-schema";

const RuleFilterBaseSchema = McpAdvancedFilterBaseSchema.describe(
  'Observation filter condition, e.g. {"column":"version","operator":"=","value":"1.0.0","type":"string"}. Use `key` for object columns such as `metadata`.',
);

const EvaluationRuleEvaluatorInputBase = {
  evaluationRuleId: RuleIdSchema.shape.ruleId.describe(
    "Stable evaluation rule ID.",
  ),
  evaluatorId: RuleAssignmentInputSchema.shape.evaluatorId.describe(
    "Stable project evaluator ID.",
  ),
};

// The tool boundary speaks the public mapping contract (`variable`/`source`),
// not the stored column ids. Handlers translate via `toStoredMappingList`.
const VariableMappingSchema = z
  .array(ObservationPromptVariableMappingInput)
  .describe(
    "Optional rule-specific variable mapping for LLM evaluators. Omit for code evaluators, whose mapping is managed by Langfuse.",
  );

export const AttachEvaluatorToEvaluationRuleBaseSchema = z.object({
  ...EvaluationRuleEvaluatorInputBase,
  variableMapping: VariableMappingSchema.optional(),
});

export const DetachEvaluatorFromEvaluationRuleInputSchema = z.object(
  EvaluationRuleEvaluatorInputBase,
);

export const EvaluationRuleEvaluatorMutationResponseSchema = z
  .object(EvaluationRuleEvaluatorInputBase)
  .strict();

const EvaluationRuleAssignmentInputSchema = z.object({
  evaluatorId: RuleAssignmentInputSchema.shape.evaluatorId.describe(
    "Stable project evaluator ID.",
  ),
  variableMapping: VariableMappingSchema.optional(),
});

export type EvaluationRuleAssignmentInput = z.infer<
  typeof EvaluationRuleAssignmentInputSchema
>;

export const CreateEvaluationRuleBaseSchema = CreateRuleSchema.omit({
  projectId: true,
  targetObject: true,
  filter: true,
  evaluatorAssignments: true,
}).extend({
  evaluatorAssignments: z
    .array(EvaluationRuleAssignmentInputSchema)
    .min(1)
    .max(100),
  filter: z
    .array(RuleFilterBaseSchema)
    .optional()
    .describe("Conditions selecting which observations the rule runs on."),
});

export const CreateEvaluationRuleInputSchema = CreateRuleSchema.omit({
  projectId: true,
  targetObject: true,
}).extend({
  evaluatorAssignments: z
    .array(EvaluationRuleAssignmentInputSchema)
    .min(1)
    .max(100),
  filter: RuleMetadataSchema.shape.filter.optional(),
});

export const ListEvaluationRulesBaseSchema = ListRulesSchema.omit({
  projectId: true,
  filter: true,
}).extend({
  filter: z
    .array(RuleFilterBaseSchema)
    .optional()
    .describe("Conditions filtering the returned evaluation rules."),
});

export const ListEvaluationRulesInputSchema = ListRulesSchema.omit({
  projectId: true,
});

export const EvaluationRuleIdInputSchema = z.object({
  evaluationRuleId: RuleIdSchema.shape.ruleId,
});

// Discovery-facing shape: `filter` is widened to the union-free base schema
// the JSON-schema guard accepts. The strict per-column union is enforced at
// runtime by `UpdateEvaluationRuleInputSchema` below.
export const UpdateEvaluationRuleBaseSchema = UpdateRuleSchema.omit({
  projectId: true,
  ruleId: true,
  filter: true,
  evaluatorMappings: true,
}).extend({
  evaluationRuleId: RuleIdSchema.shape.ruleId,
  filter: z.array(RuleFilterBaseSchema).optional(),
  evaluatorAssignments: z
    .array(EvaluationRuleAssignmentInputSchema)
    .max(100)
    .optional(),
  enabled: SetRuleEnabledSchema.shape.enabled.optional(),
});

export const UpdateEvaluationRuleInputSchema = UpdateRuleSchema.omit({
  projectId: true,
  ruleId: true,
  evaluatorMappings: true,
})
  .extend({
    evaluationRuleId: RuleIdSchema.shape.ruleId,
    filter: RuleMetadataSchema.shape.filter.optional(),
    evaluatorAssignments: z
      .array(EvaluationRuleAssignmentInputSchema)
      .max(100)
      .optional(),
    enabled: SetRuleEnabledSchema.shape.enabled.optional(),
  })
  .refine(
    ({ evaluationRuleId: _, ...patch }) =>
      Object.values(patch).some((value) => value !== undefined),
    { message: "At least one field must be provided" },
  );

/**
 * Explicit response contract so tool output stays stable and cannot leak
 * storage columns or the creator's name and email to the model.
 */
export const EvaluationRuleResponseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    enabled: z.boolean(),
    sampling: z.number(),
    filter: RuleMetadataSchema.shape.filter,
    evaluators: z.array(
      z.object({
        evaluatorId: z.string(),
        evaluatorName: z.string(),
        evaluatorType: PublicEvaluatorType,
        variableMapping: z.array(PromptVariableMappingRead).nullable(),
      }),
    ),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();

export const EvaluationRulesResponseSchema = z
  .object({
    data: z.array(EvaluationRuleResponseSchema),
    meta: z.object({
      page: z.number(),
      limit: z.number(),
      totalItems: z.number(),
      totalPages: z.number(),
    }),
  })
  .strict();
