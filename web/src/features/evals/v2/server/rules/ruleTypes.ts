import {
  EvalTargetObject,
  observationVariableMappingList,
  paginationLimitZod,
  singleFilter,
} from "@langfuse/shared";
import { z } from "zod";

export const RuleMetadataSchema = z.object({
  name: z.string().trim().min(1),
  filter: z.array(singleFilter),
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
    .array(z.enum([EvalTargetObject.EVENT, EvalTargetObject.EXPERIMENT]))
    .min(1)
    .max(2)
    .optional(),
  filter: z
    .array(singleFilter)
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

export const CreateRuleSchema = RuleMetadataSchema.extend({
  projectId: z.string(),
  targetObject: z
    .enum([EvalTargetObject.EVENT, EvalTargetObject.EXPERIMENT])
    .default(EvalTargetObject.EVENT)
    .describe(
      "Deprecated: modern rules are event rules and experiment scope is expressed through filters.",
    ),
  enabled: z.boolean(),
  evaluatorAssignments: z.array(RuleAssignmentInputSchema).max(100),
});

export const UpdateRuleSchema = RuleIdSchema.extend({
  name: RuleMetadataSchema.shape.name.optional(),
  filter: RuleMetadataSchema.shape.filter.optional(),
  sampling: RuleMetadataSchema.shape.sampling.optional(),
  enabled: z.boolean().optional(),
  evaluatorMappings: z.array(RuleAssignmentInputSchema).max(100).optional(),
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
export type CreateRuleInput = z.infer<typeof CreateRuleSchema>;
export type CreateOrAttachFromEvaluatorFiltersInput = z.infer<
  typeof CreateOrAttachFromEvaluatorFiltersSchema
>;
export type UpdateRuleInput = z.infer<typeof UpdateRuleSchema>;
export type ListRulesInput = z.infer<typeof ListRulesSchema>;
export type RuleSelectionInput = z.infer<typeof RuleSelectionSchema>;
