import { z } from "zod";
import {
  ExperimentEvaluationRuleFilter,
  ExperimentEvaluationRuleMapping,
  ObservationEvaluationRuleFilter,
  ObservationEvaluationRuleMapping,
  PublicEvaluationRuleFilter,
  PublicEvaluationRuleEvaluator,
  PublicEvaluationRuleEvaluatorReference,
  PublicEvaluationRuleMapping,
  PublicEvaluationRuleStatus,
  PublicEvaluationRuleTarget,
  UnstablePublicApiPaginationQuery,
  UnstablePublicApiPaginationResponse,
} from "@/src/features/public-api/types/unstable-public-evals-contract";

export const APIEvaluationRule = z
  .object({
    id: z.string(),
    name: z.string(),
    evaluator: PublicEvaluationRuleEvaluator,
    target: PublicEvaluationRuleTarget,
    enabled: z.boolean(),
    status: PublicEvaluationRuleStatus,
    pausedReason: z.string().nullable(),
    pausedMessage: z.string().nullable(),
    sampling: z.number().gt(0).lte(1),
    filter: z.array(PublicEvaluationRuleFilter),
    mapping: z.array(PublicEvaluationRuleMapping),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();

export const GetUnstableEvaluationRulesQuery = UnstablePublicApiPaginationQuery;

export const GetUnstableEvaluationRulesResponse = z
  .object({
    data: z.array(APIEvaluationRule),
    meta: UnstablePublicApiPaginationResponse,
  })
  .strict();

export const GetUnstableEvaluationRuleQuery = z.object({
  evaluationRuleId: z.string(),
});

export const GetUnstableEvaluationRuleResponse = APIEvaluationRule;

const EvaluationRuleCreateBase = {
  name: z.string().min(1),
  evaluator: PublicEvaluationRuleEvaluatorReference,
  enabled: z.boolean(),
  sampling: z.number().gt(0).lte(1).default(1),
};

export const PostUnstableEvaluationRuleBody = z.discriminatedUnion("target", [
  z.object({
    ...EvaluationRuleCreateBase,
    target: z.literal("observation"),
    filter: z.array(ObservationEvaluationRuleFilter).default([]),
    mapping: z.array(ObservationEvaluationRuleMapping),
  }),
  z.object({
    ...EvaluationRuleCreateBase,
    target: z.literal("experiment"),
    filter: z.array(ExperimentEvaluationRuleFilter).default([]),
    mapping: z.array(ExperimentEvaluationRuleMapping),
  }),
]);
export type PostUnstableEvaluationRuleBodyType = z.infer<
  typeof PostUnstableEvaluationRuleBody
>;

export const PostUnstableEvaluationRuleResponse = APIEvaluationRule;

export const PatchUnstableEvaluationRuleQuery = GetUnstableEvaluationRuleQuery;

const EvaluationRulePatchBase = {
  name: z.string().min(1).optional(),
  evaluator: PublicEvaluationRuleEvaluatorReference.optional(),
  enabled: z.boolean().optional(),
  sampling: z.number().gt(0).lte(1).optional(),
};

const UntargetedEvaluationRulePatch = z.object({
  ...EvaluationRulePatchBase,
  target: z.undefined().optional(),
  filter: z.undefined().optional(),
  mapping: z.undefined().optional(),
});

const ObservationEvaluationRulePatch = z.object({
  ...EvaluationRulePatchBase,
  target: z.literal("observation"),
  filter: z.array(ObservationEvaluationRuleFilter).optional(),
  mapping: z.array(ObservationEvaluationRuleMapping).optional(),
});

const ExperimentEvaluationRulePatch = z.object({
  ...EvaluationRulePatchBase,
  target: z.literal("experiment"),
  filter: z.array(ExperimentEvaluationRuleFilter).optional(),
  mapping: z.array(ExperimentEvaluationRuleMapping).optional(),
});

export const PatchUnstableEvaluationRuleBody = z
  .union([
    ObservationEvaluationRulePatch,
    ExperimentEvaluationRulePatch,
    UntargetedEvaluationRulePatch,
  ])
  .refine((data) => Object.keys(data).length > 0, {
    message:
      "Request body cannot be empty. At least one field must be provided for update.",
  });
export type PatchUnstableEvaluationRuleBodyType = z.infer<
  typeof PatchUnstableEvaluationRuleBody
>;

export const PatchUnstableEvaluationRuleResponse = APIEvaluationRule;

export const DeleteUnstableEvaluationRuleQuery = GetUnstableEvaluationRuleQuery;

export const DeleteUnstableEvaluationRuleResponse = z
  .object({
    message: z.literal("Evaluation rule successfully deleted"),
  })
  .strict();
