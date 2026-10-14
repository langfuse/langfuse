import { publicApiPaginationLimitZod } from "@langfuse/shared";
import { z } from "zod";
import {
  PromptVariableMapping,
  PromptVariableMappingInput,
  PublicEvaluationRuleReadFilter,
  StableEvaluationRuleFilter,
} from "./publicEvalsContract";
import {
  EncodedResourceCursor,
  EncodedResourceCursorString,
  PublicApiCreator,
} from "./evaluators";

const EvaluationRuleEvaluatorAssignmentInput = z
  .object({
    evaluatorId: z.string().min(1),
    variableMapping: z
      .array(PromptVariableMappingInput)
      .nullable()
      .default(null),
  })
  .strict();

const EvaluatorAssignment = z
  .object({
    evaluatorId: z.string(),
    variableMapping: z.array(PromptVariableMapping).nullable(),
  })
  .strict();

export const EvaluationRule = z
  .object({
    id: z.string(),
    name: z.string(),
    createdBy: PublicApiCreator.nullable(),
    enabled: z.boolean(),
    sampling: z.number().min(0).max(1),
    filter: z.array(PublicEvaluationRuleReadFilter),
    evaluatorAssignments: z.array(EvaluatorAssignment),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();

export const CreateEvaluationRuleBody = z
  .object({
    name: z.string().trim().min(1),
    enabled: z.boolean(),
    sampling: z.number().min(0).max(1).default(1),
    filter: z.array(StableEvaluationRuleFilter).default([]),
    evaluatorAssignments: z
      .array(EvaluationRuleEvaluatorAssignmentInput)
      .max(100),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.enabled && value.evaluatorAssignments.length === 0) {
      ctx.addIssue({
        code: "custom",
        message:
          "An enabled evaluation rule requires at least one evaluator assignment",
        path: ["evaluatorAssignments"],
      });
    }
  });

export const UpdateEvaluationRuleBody = z
  .object({
    name: z.string().trim().min(1).optional(),
    enabled: z.boolean().optional(),
    sampling: z.number().min(0).max(1).optional(),
    filter: z.array(StableEvaluationRuleFilter).optional(),
    evaluatorAssignments: z
      .array(EvaluationRuleEvaluatorAssignmentInput)
      .max(100)
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Request body cannot be empty",
  });

export const ListEvaluationRulesQuery = z
  .object({
    limit: publicApiPaginationLimitZod,
    cursor: EncodedResourceCursor.optional(),
  })
  .strict();

export const ListEvaluationRulesResponse = z
  .object({
    data: z.array(EvaluationRule),
    meta: z.object({ cursor: EncodedResourceCursorString.optional() }).strict(),
  })
  .strict();

export const EvaluationRuleIdQuery = z
  .object({ evaluationRuleId: z.string() })
  .strict();

export const DeleteEvaluationRuleResponse = z
  .object({ id: z.string() })
  .strict();

export type CreateEvaluationRuleBodyType = z.infer<
  typeof CreateEvaluationRuleBody
>;
export type UpdateEvaluationRuleBodyType = z.infer<
  typeof UpdateEvaluationRuleBody
>;
