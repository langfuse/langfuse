import { JobTimeScopeZod, singleFilter } from "@langfuse/shared";
import { z } from "zod";
import {
  ExperimentEvaluationRuleFilter,
  ExperimentPromptVariableMappingInput,
  LegacyPromptVariableMapping,
  ObservationEvaluationRuleFilter,
  ObservationPromptVariableMappingInput,
  PUBLIC_EVALUATOR_TYPE_CODE,
  PublicEvaluationRuleFilter,
  PublicEvaluationRuleReadFilter,
  PublicEvaluationRuleEvaluator,
  PublicEvaluationRuleEvaluatorReference,
  PublicEvaluationRuleEvaluatorReferencePatch,
  PromptVariableMappingRead,
  PublicEvaluationRuleLegacyTarget,
  PublicEvaluationRuleStatus,
  PublicEvaluationRuleTarget,
  UnstablePublicApiPaginationQuery,
  UnstablePublicApiPaginationResponse,
} from "@/src/features/public-api/types/unstable-public-evals-contract";

const APIEvaluationRuleBase = {
  id: z.string(),
  name: z.string(),
  // Null when the rule has no evaluator assignments. Prefer `evaluators`.
  evaluator: PublicEvaluationRuleEvaluator.nullable(),
  enabled: z.boolean(),
  status: PublicEvaluationRuleStatus,
  pausedReason: z.string().nullable(),
  pausedMessage: z.string().nullable(),
  sampling: z.number().gt(0).lte(1),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
};

const APIEvaluationRule = z
  .object({
    ...APIEvaluationRuleBase,
    evaluators: z.array(
      z.object({
        evaluator: PublicEvaluationRuleEvaluator,
        mapping: z.array(PromptVariableMappingRead).nullable(),
      }),
    ),
    target: PublicEvaluationRuleTarget,
    filter: z.array(PublicEvaluationRuleFilter),
    mapping: z.array(PromptVariableMappingRead),
  })
  .strict();

const APIReadableV2EvaluationRule = APIEvaluationRule.extend({
  filter: z.array(PublicEvaluationRuleReadFilter),
});

const APILegacyEvaluationRule = z
  .object({
    ...APIEvaluationRuleBase,
    evaluators: z.array(
      z.object({
        evaluator: PublicEvaluationRuleEvaluator,
        mapping: z.array(LegacyPromptVariableMapping).nullable(),
      }),
    ),
    target: PublicEvaluationRuleLegacyTarget,
    delay: z.number().int().nonnegative(),
    timeScope: z.array(JobTimeScopeZod),
    filter: z.array(singleFilter),
    mapping: z.array(LegacyPromptVariableMapping),
  })
  .strict();

const APIReadableEvaluationRule = z.union([
  APIReadableV2EvaluationRule,
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

const EvaluationRuleCreateBase = {
  name: z.string().min(1),
  evaluator: PublicEvaluationRuleEvaluatorReference.optional(),
  enabled: z.boolean(),
  sampling: z.number().gt(0).lte(1).default(1),
};

function evaluatorAssignment<T extends z.ZodType>(mapping: T) {
  return z.object({
    evaluator: PublicEvaluationRuleEvaluatorReference,
    mapping: z.array(mapping).optional(),
  });
}

const PostUnstableObservationEvaluationRuleBody = z.object({
  ...EvaluationRuleCreateBase,
  evaluators: z
    .array(evaluatorAssignment(ObservationPromptVariableMappingInput))
    .min(1)
    .max(100)
    .optional(),
  target: z.literal("observation"),
  filter: z.array(ObservationEvaluationRuleFilter).default([]),
  mapping: z.array(ObservationPromptVariableMappingInput).optional(),
});

const PostUnstableExperimentEvaluationRuleBody = z.object({
  ...EvaluationRuleCreateBase,
  evaluators: z
    .array(evaluatorAssignment(ExperimentPromptVariableMappingInput))
    .min(1)
    .max(100)
    .optional(),
  target: z.literal("experiment"),
  filter: z.array(ExperimentEvaluationRuleFilter).default([]),
  mapping: z.array(ExperimentPromptVariableMappingInput).optional(),
});

// `code` evaluators use a fixed runtime mapping managed by Langfuse. LLM
// mappings may be omitted to inherit the evaluator version's default mapping.
export const PostUnstableEvaluationRuleBody = z
  .discriminatedUnion("target", [
    PostUnstableObservationEvaluationRuleBody,
    PostUnstableExperimentEvaluationRuleBody,
  ])
  .refine((data) => Boolean(data.evaluator) !== Boolean(data.evaluators), {
    path: ["evaluators"],
    message: "Provide exactly one of evaluator or evaluators.",
  })
  .refine((data) => !data.evaluators || data.mapping === undefined, {
    path: ["mapping"],
    message:
      "`mapping` is the deprecated single-evaluator alias and cannot be combined with `evaluators`. Set the mapping on the matching entry in `evaluators` instead.",
  })
  .refine(
    (data) =>
      (!data.evaluator ||
        data.evaluator.type !== PUBLIC_EVALUATOR_TYPE_CODE ||
        data.mapping === undefined) &&
      (data.evaluators ?? []).every(
        (assignment) =>
          assignment.evaluator.type !== PUBLIC_EVALUATOR_TYPE_CODE ||
          assignment.mapping === undefined,
      ),
    {
      path: ["mapping"],
      message:
        "Code evaluator mappings are managed by Langfuse and cannot be provided in the request body.",
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
const EvaluationRulePatchBase = {
  name: z.string().min(1).optional(),
  evaluator: PublicEvaluationRuleEvaluatorReferencePatch.optional(),
  enabled: z.boolean().optional(),
  sampling: z.number().gt(0).lte(1).optional(),
};

// Replacing `evaluators` is a full set replacement: entries not listed are
// detached. Mutually exclusive with the deprecated `evaluator`/`mapping` pair,
// which only ever addressed the first assignment.
function patchEvaluators<T extends z.ZodType>(mapping: T) {
  return z.array(evaluatorAssignment(mapping)).min(1).max(100).optional();
}

function assertExclusiveEvaluatorFields<
  T extends { evaluator?: unknown; mapping?: unknown; evaluators?: unknown },
>(data: T) {
  return (
    !data.evaluators ||
    (data.evaluator === undefined && data.mapping === undefined)
  );
}

const EXCLUSIVE_EVALUATOR_FIELDS_MESSAGE =
  "`evaluators` replaces the whole assignment set and cannot be combined with the deprecated `evaluator` or `mapping` fields.";

const UntargetedEvaluationRulePatch = z.object({
  ...EvaluationRulePatchBase,
  evaluators: patchEvaluators(ObservationPromptVariableMappingInput),
  target: z.undefined().optional(),
  filter: z.undefined().optional(),
  mapping: z.undefined().optional(),
});

const ObservationEvaluationRulePatch = z.object({
  ...EvaluationRulePatchBase,
  evaluators: patchEvaluators(ObservationPromptVariableMappingInput),
  target: z.literal("observation"),
  filter: z.array(ObservationEvaluationRuleFilter).optional(),
  mapping: z.array(ObservationPromptVariableMappingInput).optional(),
});

const ExperimentEvaluationRulePatch = z.object({
  ...EvaluationRulePatchBase,
  evaluators: patchEvaluators(ExperimentPromptVariableMappingInput),
  target: z.literal("experiment"),
  filter: z.array(ExperimentEvaluationRuleFilter).optional(),
  mapping: z.array(ExperimentPromptVariableMappingInput).optional(),
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
  })
  .refine(assertExclusiveEvaluatorFields, {
    path: ["evaluators"],
    message: EXCLUSIVE_EVALUATOR_FIELDS_MESSAGE,
  });
export type PatchUnstableEvaluationRuleBodyType = z.infer<
  typeof PatchUnstableEvaluationRuleBody
>;

/** @alias */
export const PatchUnstableEvaluationRuleResponse = APIReadableV2EvaluationRule;

/** @alias */
export const DeleteUnstableEvaluationRuleQuery = GetUnstableEvaluationRuleQuery;

export const DeleteUnstableEvaluationRuleResponse = z
  .object({
    message: z.literal("Evaluation rule successfully deleted"),
  })
  .strict();
