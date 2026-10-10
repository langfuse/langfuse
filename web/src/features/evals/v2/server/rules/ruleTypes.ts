import {
  EvalTargetObject,
  observationVariableMappingList,
  paginationLimitZod,
  ScoreResultTriggerSchema,
  singleFilterList,
} from "@langfuse/shared";
import { z } from "zod";

export const RuleMetadataSchema = z.object({
  name: z.string().trim().min(1),
  filter: singleFilterList,
  sampling: z.number().min(0).max(1),
});

export const RuleAssignmentInputSchema = z.object({
  evaluatorId: z.string().min(1),
  variableMapping: observationVariableMappingList.nullable(),
});

export const RuleIdSchema = z.object({
  projectId: z.string(),
  ruleId: z.string(),
});

export const RuleIdsSchema = z.object({
  projectId: z.string(),
  ruleIds: z.array(z.string()).max(100),
});

export const ListRulesSchema = z.object({
  projectId: z.string(),
  page: z.number().int().positive().default(1),
  limit: paginationLimitZod.optional().default(50),
  orderBy: z
    .object({
      column: z.enum(["name", "enabled", "sampling", "createdAt", "updatedAt"]),
      order: z.enum(["ASC", "DESC"]),
    })
    .optional(),
  search: z.string().trim().max(200).optional(),
  enabled: z.boolean().optional(),
  targetObjects: z
    .array(
      z.enum([
        EvalTargetObject.EVENT,
        EvalTargetObject.EXPERIMENT,
        EvalTargetObject.SCORE_RESULT,
      ]),
    )
    .min(1)
    .max(3)
    .optional(),
  filter: singleFilterList
    .superRefine((filters, ctx) => {
      for (const [index, filter] of filters.entries()) {
        const valid =
          ((filter.column === "name" || filter.column === "creator") &&
            (filter.type === "string" || filter.type === "stringOptions")) ||
          ((filter.column === "enabled" ||
            filter.column === "upgradeRequired") &&
            filter.type === "boolean");
        if (!valid) {
          ctx.addIssue({
            code: "custom",
            message: `Unsupported evaluation rule filter: ${filter.column}`,
            path: [index],
          });
        }
      }
    })
    .optional(),
});

export const CreateRuleBaseSchema = RuleMetadataSchema.extend({
  projectId: z.string(),
  targetObject: z
    .enum([
      EvalTargetObject.EVENT,
      EvalTargetObject.EXPERIMENT,
      EvalTargetObject.SCORE_RESULT,
    ])
    .default(EvalTargetObject.EVENT)
    .describe(
      "Rule trigger source. Experiment scope is normalized to event filters.",
    ),
  enabled: z.boolean(),
  evaluatorAssignments: z.array(RuleAssignmentInputSchema).max(100),
  scoreResultTrigger: ScoreResultTriggerSchema.nullable().default(null),
});

export const CreateRuleSchema = CreateRuleBaseSchema.superRefine(
  (rule, ctx) => {
    if (rule.targetObject !== EvalTargetObject.SCORE_RESULT) {
      if (rule.scoreResultTrigger !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["scoreResultTrigger"],
          message:
            "Observation rules cannot define an evaluator result trigger",
        });
      }
      return;
    }

    if (rule.scoreResultTrigger === null) {
      ctx.addIssue({
        code: "custom",
        path: ["scoreResultTrigger"],
        message:
          "Evaluator result rules require a trigger evaluator and scores",
      });
    }
    if (rule.filter.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["filter"],
        message: "Evaluator result rules cannot define observation filters",
      });
    }
    if (rule.sampling !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["sampling"],
        message: "Evaluator result rules run for every matching result",
      });
    }
  },
);

export const UpdateRuleSchema = RuleIdSchema.extend({
  name: RuleMetadataSchema.shape.name.optional(),
  filter: RuleMetadataSchema.shape.filter.optional(),
  sampling: RuleMetadataSchema.shape.sampling.optional(),
  enabled: z.boolean().optional(),
  evaluatorMappings: z.array(RuleAssignmentInputSchema).max(100).optional(),
  targetObject: z
    .enum([
      EvalTargetObject.EVENT,
      EvalTargetObject.EXPERIMENT,
      EvalTargetObject.SCORE_RESULT,
    ])
    .optional(),
  scoreResultTrigger: ScoreResultTriggerSchema.nullable().optional(),
});

export const SetRuleEnabledSchema = RuleIdSchema.extend({
  enabled: z.boolean(),
  // The activation dialog can adjust the sampling rate while confirming, so
  // both land in one transaction and one audit entry.
  sampling: RuleMetadataSchema.shape.sampling.optional(),
});

export const RuleAssignmentSchema = RuleIdSchema.extend({
  evaluatorId: z.string(),
  variableMapping: observationVariableMappingList.nullable(),
  enableRule: z.boolean().optional(),
});

export const RuleAssignmentIdSchema = RuleIdSchema.extend({
  evaluatorId: z.string(),
});

const ExplicitRuleSelectionSchema = z.object({
  projectId: z.string(),
  ruleIds: z
    .array(z.string())
    .min(1)
    .max(100)
    .refine((ruleIds) => new Set(ruleIds).size === ruleIds.length, {
      message: "Rule IDs must be unique",
    }),
});

const FilteredRuleSelectionSchema = z.object({
  projectId: z.string(),
  isBatchAction: z.literal(true),
  search: z.string().trim().max(200).optional(),
  filter: ListRulesSchema.shape.filter,
});

export const RuleSelectionSchema = z.union([
  ExplicitRuleSelectionSchema,
  FilteredRuleSelectionSchema,
]);

export const SetRulesEnabledSchema = z.intersection(
  RuleSelectionSchema,
  z.object({ enabled: z.boolean() }),
);

export const EvaluatorRulesSchema = z.object({
  projectId: z.string(),
  evaluatorId: z.string(),
});

export const SuggestRuleNameSchema = z.object({
  projectId: z.string(),
  filter: RuleMetadataSchema.shape.filter,
  sampling: RuleMetadataSchema.shape.sampling,
});

export const CreateOrAttachFromEvaluatorFiltersSchema = z.object({
  projectId: z.string(),
  evaluatorId: z.string().min(1),
  filter: RuleMetadataSchema.shape.filter,
  sampling: RuleMetadataSchema.shape.sampling,
});

export type RuleAssignmentInput = z.infer<typeof RuleAssignmentInputSchema>;
export type CreateRuleInput = z.input<typeof CreateRuleSchema>;
export type ParsedCreateRuleInput = z.output<typeof CreateRuleSchema>;
export type CreateOrAttachFromEvaluatorFiltersInput = z.infer<
  typeof CreateOrAttachFromEvaluatorFiltersSchema
>;
export type UpdateRuleInput = z.infer<typeof UpdateRuleSchema>;
export type ListRulesInput = z.infer<typeof ListRulesSchema>;
export type RuleSelectionInput = z.infer<typeof RuleSelectionSchema>;
