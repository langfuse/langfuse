import { JobTimeScopeZod, singleFilter } from "@langfuse/shared";
import { z } from "zod";
import {
  ExperimentEvaluationRuleFilter,
  ExperimentEvaluationRuleMapping,
  LegacyEvaluationRuleMapping,
  ObservationEvaluationRuleFilter,
  ObservationEvaluationRuleMapping,
  PUBLIC_EVALUATOR_TYPE_CODE,
  PublicEvaluationRuleFilter,
  PublicEvaluationRuleEvaluator,
  PublicEvaluationRuleEvaluatorReference,
  PublicEvaluationRuleEvaluatorReferencePatch,
  PublicEvaluationRuleMapping,
  PublicEvaluationRuleLegacyTarget,
  PublicEvaluationRuleStatus,
  PublicEvaluationRuleTarget,
  UnstablePublicApiPaginationQuery,
  UnstablePublicApiPaginationResponse,
} from "@/src/features/public-api/types/unstable-public-evals-contract";

const APIEvaluationRuleBase = {
  id: z.string(),
  name: z.string(),
  evaluator: PublicEvaluationRuleEvaluator,
  enabled: z.boolean(),
  status: PublicEvaluationRuleStatus,
  pausedReason: z.string().nullable(),
  pausedMessage: z.string().nullable(),
  sampling: z.number().gt(0).lte(1),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
};

export const APIEvaluationRule = z
  .object({
    ...APIEvaluationRuleBase,
    target: PublicEvaluationRuleTarget,
    filter: z.array(PublicEvaluationRuleFilter),
    mapping: z.array(PublicEvaluationRuleMapping),
  })
  .strict();

export const APILegacyEvaluationRule = z
  .object({
    ...APIEvaluationRuleBase,
    target: PublicEvaluationRuleLegacyTarget,
    delay: z.number().int().nonnegative(),
    timeScope: z.array(JobTimeScopeZod),
    filter: z.array(singleFilter),
    mapping: z.array(LegacyEvaluationRuleMapping),
  })
  .strict();

export const APIReadableEvaluationRule = z.union([
  APIEvaluationRule,
  APILegacyEvaluationRule,
]);

export const GetUnstableEvaluationRulesQuery = UnstablePublicApiPaginationQuery;

export const GetUnstableEvaluationRulesResponse = z
  .object({
    data: z.array(APIReadableEvaluationRule),
    meta: UnstablePublicApiPaginationResponse,
  })
  .strict();

export const GetUnstableEvaluationRuleQuery = z.object({
  evaluationRuleId: z.string(),
});

/** @alias */
export const GetUnstableEvaluationRuleResponse = APIReadableEvaluationRule;

export const EvaluationRuleCreateBase = {
  name: z.string().min(1),
  evaluator: PublicEvaluationRuleEvaluatorReference,
  enabled: z.boolean(),
  sampling: z.number().gt(0).lte(1).default(1),
};

const PostUnstableObservationEvaluationRuleBody = z.object({
  ...EvaluationRuleCreateBase,
  target: z.literal("observation"),
  filter: z.array(ObservationEvaluationRuleFilter).default([]),
  mapping: z.array(ObservationEvaluationRuleMapping).optional(),
});

const PostUnstableExperimentEvaluationRuleBody = z.object({
  ...EvaluationRuleCreateBase,
  target: z.literal("experiment"),
  filter: z.array(ExperimentEvaluationRuleFilter).default([]),
  mapping: z.array(ExperimentEvaluationRuleMapping).optional(),
});

// `code` evaluators use a fixed runtime mapping managed by Langfuse and must
// omit `mapping`; `llm_as_judge` evaluators require it.
export const PostUnstableEvaluationRuleBody = z
  .discriminatedUnion("target", [
    PostUnstableObservationEvaluationRuleBody,
    PostUnstableExperimentEvaluationRuleBody,
  ])
  .refine(
    (data) =>
      data.evaluator.type !== PUBLIC_EVALUATOR_TYPE_CODE ||
      data.mapping === undefined,
    {
      path: ["mapping"],
      message:
        "Code evaluator mappings are managed by Langfuse and cannot be provided in the request body.",
    },
  )
  .refine(
    (data) =>
      data.evaluator.type === PUBLIC_EVALUATOR_TYPE_CODE ||
      data.mapping !== undefined,
    {
      path: ["mapping"],
      message: "LLM-as-judge evaluation rules require a variable mapping.",
    },
  );
export type PostUnstableEvaluationRuleBodyType = z.infer<
  typeof PostUnstableEvaluationRuleBody
>;

/** @alias */
export const PostUnstableEvaluationRuleResponse = APIEvaluationRule;

/** @alias */
export const PatchUnstableEvaluationRuleQuery = GetUnstableEvaluationRuleQuery;

// Exported for reuse (see EvaluationRuleCreateBase) — the create fields, all
// made optional for PATCH.
export const EvaluationRulePatchBase = {
  name: z.string().min(1).optional(),
  evaluator: PublicEvaluationRuleEvaluatorReferencePatch.optional(),
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

/** @alias */
export const PatchUnstableEvaluationRuleResponse = APIEvaluationRule;

/** @alias */
export const DeleteUnstableEvaluationRuleQuery = GetUnstableEvaluationRuleQuery;

export const DeleteUnstableEvaluationRuleResponse = z
  .object({
    message: z.literal("Evaluation rule successfully deleted"),
  })
  .strict();
