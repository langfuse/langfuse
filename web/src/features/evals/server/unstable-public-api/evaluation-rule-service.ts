import { type ApiAccessScope } from "@langfuse/shared/src/server";
import { EvalTemplateType, prisma } from "@langfuse/shared/src/db";
import {
  JobConfigState,
  InternalServerError,
  LangfuseNotFoundError,
  EvalTargetObject,
  type FilterCondition,
  type FilterState,
  type ObservationVariableMapping,
} from "@langfuse/shared";
import {
  assertCodeEvalRuleCanRun,
  CodeEvalJobConfigError,
} from "@/src/features/evals/server/codeEvalJobConfigValidation";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE } from "@/src/features/evals/server/audit-log-resource-types";
import {
  isCodeEvalEnabled,
  isCodeEvalSourceCodeLanguageSupported,
} from "@/src/features/evals/server/isCodeEvalEnabled";
import { createStructuredPublicApiError } from "@/src/features/public-api";
import {
  PublicEvaluationRuleFilter,
  type PatchUnstableEvaluationRuleBodyType,
  type PostUnstableEvaluationRuleBodyType,
  type PromptVariableMappingInputType,
  type PromptVariableMappingReadType,
  type PublicEvaluationRuleTargetType,
  PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE,
} from "@/src/features/public-api/server";
import {
  deriveEvaluatorVariables,
  toApiMappings,
  toApiV2EvaluationRule,
  toApiWritableV2EvaluationRule,
  toEvaluationRuleFields,
  toEvaluationRuleInput,
  toPublicEvaluatorType,
  toStoredAssignmentMapping,
} from "./adapters";
import {
  ActiveEvaluationRuleLimitError,
  assertActiveRuleLimitNotExceeded,
} from "@/src/features/evals/v2/server/rules/ruleErrors";
import { RuleService } from "@/src/features/evals/v2/server/rules/ruleService";
import {
  findPublicV2EvaluatorByIdOrThrow,
  findPublicV2EvaluationRule,
  findPublicV2EvaluatorInFamilyOrThrow,
  listPublicEvaluationRulePage,
} from "./queries";
import type {
  EvaluationRuleEvaluatorFamilyReference,
  StoredPublicEvaluatorTemplate,
  StoredPublicV2EvaluationRule,
} from "./types";
import {
  assertEvaluationRuleFilterValuesExistForProject,
  assertEvaluatorDefinitionCanRunForPublicApi,
} from "./validation";
import { assertUnreachable } from "@/src/utils/types";

const ruleService = new RuleService(prisma, async () => undefined);

function getRequestedEvaluatorAssignments(
  input: PostUnstableEvaluationRuleBodyType,
) {
  if (input.evaluators) return input.evaluators;
  return [{ evaluator: input.evaluator!, mapping: input.mapping }];
}

type PublicV2Evaluator = Awaited<
  ReturnType<typeof findPublicV2EvaluatorInFamilyOrThrow>
>;

function toEvaluatorDefinition(
  evaluator: PublicV2Evaluator,
): StoredPublicEvaluatorTemplate {
  const version = evaluator.versions[0];
  if (!version) {
    throw createStructuredPublicApiError({
      httpCode: 500,
      code: "internal_error",
      message: "Evaluator version is missing",
    });
  }
  return {
    id: evaluator.id,
    projectId: evaluator.projectId,
    name: evaluator.name,
    version: version.version,
    type: evaluator.type,
    prompt: version.prompt,
    promptMessages: version.promptMessages,
    partner: version.partner,
    provider: version.provider,
    model: version.model,
    modelParams: version.modelParams,
    vars: version.vars,
    outputDefinition: version.outputDefinition,
    sourceCode: version.sourceCode,
    sourceCodeLanguage: version.sourceCodeLanguage,
    variableMapping: version.variableMapping,
    createdAt: evaluator.createdAt,
    updatedAt: evaluator.updatedAt,
  };
}

async function resolveProjectEvaluator(params: {
  projectId: string;
  evaluator: EvaluationRuleEvaluatorFamilyReference;
  evaluatorId?: string;
}) {
  return params.evaluatorId
    ? findPublicV2EvaluatorByIdOrThrow({
        projectId: params.projectId,
        evaluatorId: params.evaluatorId,
      })
    : findPublicV2EvaluatorInFamilyOrThrow({
        projectId: params.projectId,
        evaluator: params.evaluator,
      });
}

async function assertEvaluationRuleCanRunForPublicApi(params: {
  orgId: string;
  projectId: string;
  evaluatorId: string;
  template: StoredPublicEvaluatorTemplate;
  target: EvalTargetObject;
  mapping: unknown;
  scoreName: string;
  filter: FilterCondition[] | null;
}) {
  if (params.template.type !== EvalTemplateType.CODE) {
    await assertEvaluatorDefinitionCanRunForPublicApi({
      projectId: params.projectId,
      template: {
        name: params.template.name,
        provider: params.template.provider,
        model: params.template.model,
        modelParams: params.template.modelParams,
        outputDefinition: params.template.outputDefinition,
      },
    });
    return;
  }

  if (!isCodeEvalEnabled()) {
    throw createStructuredPublicApiError({
      httpCode: 403,
      code: "access_denied",
      message: "Code evals are not enabled",
      details: { evaluatorName: params.template.name },
    });
  }
  if (
    !isCodeEvalSourceCodeLanguageSupported(params.template.sourceCodeLanguage)
  ) {
    throw createStructuredPublicApiError({
      httpCode: 400,
      code: "invalid_request",
      message:
        "This code evaluator language is not supported by the configured dispatcher.",
      details: { evaluatorName: params.template.name },
    });
  }

  try {
    await assertCodeEvalRuleCanRun({
      prisma,
      orgId: params.orgId,
      projectId: params.projectId,
      evaluatorId: params.evaluatorId,
      target: params.target,
      mapping: params.mapping,
      scoreName: params.scoreName,
      filter: params.filter,
    });
  } catch (error) {
    if (!(error instanceof CodeEvalJobConfigError)) throw error;
    const details = { evaluatorName: params.template.name };
    switch (error.code) {
      case "invalid_target":
      case "invalid_request":
        throw createStructuredPublicApiError({
          httpCode: 400,
          code: "invalid_request",
          message: error.message,
          details,
        });
      case "resource_not_found":
        throw createStructuredPublicApiError({
          httpCode: 404,
          code: "resource_not_found",
          message: error.message,
          details,
        });
      case "preflight_failed":
        throw createStructuredPublicApiError({
          httpCode: 422,
          code: "evaluator_preflight_failed",
          message: error.message,
          details,
        });
      default:
        return assertUnreachable(error.code);
    }
  }
}

// The cap itself lives in the rule service so tRPC, MCP, and this API cannot
// drift; only the error envelope is public-API specific.
async function assertActivePublicApiEvaluationRuleLimitNotExceeded(
  projectId: string,
) {
  try {
    await assertActiveRuleLimitNotExceeded({
      prisma,
      projectId,
      additionalActiveRules: 1,
    });
  } catch (error) {
    throwPublicRuleServiceError(error);
  }
}

function throwPublicRuleServiceError(error: unknown): never {
  if (error instanceof ActiveEvaluationRuleLimitError) {
    throw createStructuredPublicApiError({
      httpCode: 409,
      code: "conflict",
      message: error.message,
      details: { limit: error.limit },
    });
  }
  throw error;
}

async function runRuleServiceMutation<T>(mutation: () => Promise<T>) {
  try {
    return await mutation();
  } catch (error) {
    throwPublicRuleServiceError(error);
  }
}

async function findPublicV2EvaluationRuleOrThrow(params: {
  projectId: string;
  evaluationRuleId: string;
}) {
  const rule = await findPublicV2EvaluationRule(params);
  if (!rule) {
    throw new LangfuseNotFoundError(
      "Evaluation rule not found within authorized project",
    );
  }
  // A rule with no assignments is still a real, addressable resource: it must
  // stay readable and deletable rather than 404 while consuming a slot.
  return rule;
}

async function findPublicWritableV2EvaluationRuleOrThrow(params: {
  projectId: string;
  evaluationRuleId: string;
}) {
  const rule = await findPublicV2EvaluationRuleOrThrow(params);
  if (
    rule.targetObject !== EvalTargetObject.EVENT &&
    rule.targetObject !== EvalTargetObject.EXPERIMENT
  ) {
    throw new LangfuseNotFoundError(
      "Evaluation rule not found within authorized project",
    );
  }
  return rule;
}

function toApiReadableV2EvaluationRule(rule: StoredPublicV2EvaluationRule) {
  const evaluationRule = toApiV2EvaluationRule(rule);
  if (
    evaluationRule.target !== "observation" &&
    evaluationRule.target !== "experiment"
  ) {
    throw new InternalServerError("Evaluation rule target is corrupted");
  }
  return evaluationRule;
}

export async function listPublicEvaluationRules(params: {
  projectId: string;
  page: number;
  limit: number;
}) {
  const { records, totalItems } = await listPublicEvaluationRulePage(params);
  return {
    data: records.map(toApiV2EvaluationRule),
    meta: {
      page: params.page,
      limit: params.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / params.limit),
    },
  };
}

export async function getPublicEvaluationRule(params: {
  projectId: string;
  evaluationRuleId: string;
}) {
  return toApiV2EvaluationRule(await findPublicV2EvaluationRuleOrThrow(params));
}

export async function createPublicEvaluationRule(params: {
  orgId: string;
  projectId: string;
  input: PostUnstableEvaluationRuleBodyType;
  evaluatorId?: string;
  auditScope?: Pick<ApiAccessScope, "orgId" | "apiKeyId">;
}) {
  // Scoped to the targets this API can write. Rule names carry no uniqueness constraint, so this
  // only exists to hand back the id to PATCH instead of a second rule -- and PATCH 404s on the
  // trace/dataset rules the backfill brought in, so including those would be a dead end.
  const existing = await prisma.evaluationRule.findFirst({
    where: {
      projectId: params.projectId,
      name: params.input.name,
      targetObject: {
        in: [EvalTargetObject.EVENT, EvalTargetObject.EXPERIMENT],
      },
    },
    select: { id: true },
  });
  if (existing) {
    throw createStructuredPublicApiError({
      httpCode: 409,
      code: "name_conflict",
      message: `An evaluation rule named "${params.input.name}" already exists in this project. Use PATCH /api/public/unstable/evaluation-rules/${existing.id} to update it instead of creating a duplicate.`,
      details: { field: "name" },
    });
  }
  if (params.input.enabled) {
    await assertActivePublicApiEvaluationRuleLimitNotExceeded(params.projectId);
  }
  await assertEvaluationRuleFilterValuesExistForProject({
    projectId: params.projectId,
    target: params.input.target,
    filters: params.input.filter,
  });

  const requestedAssignments = getRequestedEvaluatorAssignments(params.input);
  const evaluators = await Promise.all(
    requestedAssignments.map(({ evaluator }, index) =>
      resolveProjectEvaluator({
        projectId: params.projectId,
        evaluator,
        evaluatorId:
          params.evaluatorId && requestedAssignments.length === 1 && index === 0
            ? params.evaluatorId
            : undefined,
      }),
    ),
  );
  if (new Set(evaluators.map(({ id }) => id)).size !== evaluators.length) {
    throw createStructuredPublicApiError({
      httpCode: 409,
      code: "conflict",
      message: "An evaluator can only be attached once to an evaluation rule.",
    });
  }

  const preparedAssignments = requestedAssignments.map((assignment, index) => {
    const evaluator = evaluators[index]!;
    const template = toEvaluatorDefinition(evaluator);
    const effectiveMapping =
      assignment.mapping ??
      (template.variableMapping == null
        ? undefined
        : toApiMappings(template.variableMapping));
    const data = toEvaluationRuleInput({
      input: {
        name: params.input.name,
        target: params.input.target,
        enabled: params.input.enabled,
        sampling: params.input.sampling,
        filter: params.input.filter,
        mapping: effectiveMapping,
      },
      evaluatorVariables: deriveEvaluatorVariables(template),
      evaluatorType: toPublicEvaluatorType(template.type),
    });
    return { assignment, evaluator, template, data };
  });

  await Promise.all(
    preparedAssignments.map(({ evaluator, template, data }) =>
      data.status === JobConfigState.ACTIVE
        ? assertEvaluationRuleCanRunForPublicApi({
            orgId: params.orgId,
            projectId: params.projectId,
            evaluatorId: evaluator.id,
            template,
            target: data.targetObject as EvalTargetObject,
            mapping: data.variableMapping,
            scoreName: data.scoreName,
            filter: data.filter,
          })
        : Promise.resolve(),
    ),
  );

  const firstData = preparedAssignments[0]!.data;
  const created = await createRuleWithRuleService({
    projectId: params.projectId,
    data: firstData,
    assignments: preparedAssignments,
  });
  const evaluationRule = toApiWritableV2EvaluationRule(created);
  if (params.auditScope) {
    await auditLog({
      action: "create",
      resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
      resourceId: evaluationRule.id,
      projectId: params.projectId,
      orgId: params.auditScope.orgId,
      apiKeyId: params.auditScope.apiKeyId,
      after: evaluationRule,
    });
  }
  return evaluationRule;
}

async function createRuleWithRuleService(params: {
  projectId: string;
  data: ReturnType<typeof toEvaluationRuleInput>;
  assignments: Array<{
    evaluator: PublicV2Evaluator;
    assignment: { mapping?: PromptVariableMappingInputType[] };
    data: ReturnType<typeof toEvaluationRuleInput>;
  }>;
}) {
  const created = await runRuleServiceMutation(() =>
    ruleService.create(
      {
        projectId: params.projectId,
        name: params.data.scoreName,
        targetObject: params.data.targetObject,
        enabled: params.data.status === JobConfigState.ACTIVE,
        sampling: params.data.sampling,
        filter: params.data.filter as FilterState,
        evaluatorAssignments: params.assignments.map(
          ({ assignment, evaluator, data }) => ({
            evaluatorId: evaluator.id,
            variableMapping:
              assignment.mapping === undefined
                ? null
                : (data.variableMapping as ObservationVariableMapping[]),
          }),
        ),
      },
      null,
    ),
  );
  return findPublicV2EvaluationRuleOrThrow({
    projectId: params.projectId,
    evaluationRuleId: created.id,
  });
}

type PreparedAssignment = {
  evaluatorId: string;
  template: StoredPublicEvaluatorTemplate;
  /** null stores "inherit the evaluator version's default mapping". */
  storedMapping: unknown;
  /** Mapping the rule would actually run with, for preflight validation. */
  effectiveMapping: unknown;
};

function toWritableMappingsIfComplete(
  mappings: PromptVariableMappingReadType[],
): PromptVariableMappingInputType[] | undefined {
  const completeMappings: PromptVariableMappingInputType[] = [];
  for (const mapping of mappings) {
    if (mapping.source === null) return undefined;
    completeMappings.push({ ...mapping, source: mapping.source });
  }
  return completeMappings;
}

/**
 * Resolve one requested assignment (public shape) into its stored form.
 * An omitted mapping inherits the evaluator version's default.
 */
async function prepareAssignment(params: {
  projectId: string;
  target: PublicEvaluationRuleTargetType;
  evaluator: EvaluationRuleEvaluatorFamilyReference;
  mapping?: PromptVariableMappingInputType[];
  evaluatorId?: string;
}): Promise<PreparedAssignment> {
  const evaluator = await resolveProjectEvaluator({
    projectId: params.projectId,
    evaluator: params.evaluator,
    evaluatorId: params.evaluatorId,
  });
  const template = toEvaluatorDefinition(evaluator);
  const inherited =
    template.variableMapping == null
      ? undefined
      : toApiMappings(template.variableMapping);
  const storedMapping =
    params.mapping === undefined
      ? null
      : toStoredAssignmentMapping({
          target: params.target,
          mapping: params.mapping,
          evaluatorVariables: deriveEvaluatorVariables(template),
          evaluatorType: toPublicEvaluatorType(template.type),
        });
  const effectiveMapping = toStoredAssignmentMapping({
    target: params.target,
    mapping: params.mapping ?? inherited,
    evaluatorVariables: deriveEvaluatorVariables(template),
    evaluatorType: toPublicEvaluatorType(template.type),
  });
  return {
    evaluatorId: evaluator.id,
    template,
    storedMapping,
    effectiveMapping,
  };
}

function assertUniqueEvaluators(assignments: Array<{ evaluatorId: string }>) {
  const ids = assignments.map(({ evaluatorId }) => evaluatorId);
  if (new Set(ids).size !== ids.length) {
    throw createStructuredPublicApiError({
      httpCode: 409,
      code: "conflict",
      message: "An evaluator can only be attached once to an evaluation rule.",
    });
  }
}

/** Preflight every assignment the rule would run with once it is active. */
async function assertAssignmentsCanRun(params: {
  orgId: string;
  projectId: string;
  assignments: PreparedAssignment[];
  targetObject: EvalTargetObject;
  scoreName: string;
  filter: FilterCondition[] | null;
}) {
  await Promise.all(
    params.assignments.map((assignment) =>
      assertEvaluationRuleCanRunForPublicApi({
        orgId: params.orgId,
        projectId: params.projectId,
        evaluatorId: assignment.evaluatorId,
        template: assignment.template,
        target: params.targetObject,
        mapping: assignment.effectiveMapping,
        scoreName: params.scoreName,
        filter: params.filter,
      }),
    ),
  );
}

export async function updatePublicEvaluationRule(params: {
  orgId: string;
  projectId: string;
  evaluationRuleId: string;
  input: PatchUnstableEvaluationRuleBodyType;
  auditScope?: Pick<ApiAccessScope, "orgId" | "apiKeyId">;
}) {
  const existing = await findPublicWritableV2EvaluationRuleOrThrow(params);
  const existingPublic = toApiReadableV2EvaluationRule(existing);
  const nextEnabled = params.input.enabled ?? existingPublic.enabled;
  if (nextEnabled && existingPublic.status !== "active") {
    await assertActivePublicApiEvaluationRuleLimitNotExceeded(params.projectId);
  }
  const suppliedTarget =
    "target" in params.input ? params.input.target : undefined;
  const suppliedFilter =
    "filter" in params.input ? params.input.filter : undefined;
  const nextTarget = suppliedTarget ?? existingPublic.target;
  if (suppliedFilter !== undefined) {
    await assertEvaluationRuleFilterValuesExistForProject({
      projectId: params.projectId,
      target: nextTarget,
      filters: suppliedFilter,
    });
  }
  const updatesFilterOrTarget =
    suppliedFilter !== undefined ||
    (suppliedTarget !== undefined && suppliedTarget !== existingPublic.target);
  const parsedExistingFilter = PublicEvaluationRuleFilter.array().safeParse(
    existingPublic.filter,
  );
  if (
    updatesFilterOrTarget &&
    suppliedFilter === undefined &&
    !parsedExistingFilter.success
  ) {
    throw createStructuredPublicApiError({
      httpCode: 400,
      code: "invalid_body",
      message:
        "The stored filter is no longer accepted for writes. Provide a target-compatible filter with this update.",
      details: { field: "filter" },
    });
  }
  const ruleFields = toEvaluationRuleFields({
    name: params.input.name ?? existingPublic.name,
    target: nextTarget,
    enabled: nextEnabled,
    sampling: params.input.sampling ?? existingPublic.sampling,
    // Target changes must also validate the effective filter against the new target.
    filter: updatesFilterOrTarget
      ? (suppliedFilter ?? parsedExistingFilter.data ?? [])
      : [],
  });

  const firstAssignment = existing.assignments[0];
  const patchesFirstAssignment =
    params.input.evaluator !== undefined ||
    ("mapping" in params.input && params.input.mapping !== undefined);

  if (
    "mapping" in params.input &&
    params.input.mapping !== undefined &&
    firstAssignment?.evaluator.type === EvalTemplateType.CODE
  ) {
    throw createStructuredPublicApiError({
      httpCode: 400,
      code: "invalid_body",
      message:
        "Code evaluator mappings are managed by Langfuse and cannot be provided in the request body.",
      details: { field: "mapping" },
    });
  }
  if (patchesFirstAssignment && !firstAssignment && !params.input.evaluator) {
    throw createStructuredPublicApiError({
      httpCode: 400,
      code: "invalid_body",
      message:
        "This evaluation rule has no evaluator assignments, so there is no mapping to update. Provide `evaluators` to attach one.",
      details: { field: "mapping" },
    });
  }

  // Three shapes: replace the whole set, patch the first assignment (deprecated
  // aliases), or leave assignments untouched.
  const replacementAssignments = params.input.evaluators
    ? await Promise.all(
        params.input.evaluators.map((assignment) =>
          prepareAssignment({
            projectId: params.projectId,
            target: nextTarget,
            evaluator: assignment.evaluator,
            mapping: assignment.mapping,
          }),
        ),
      )
    : null;
  if (replacementAssignments) assertUniqueEvaluators(replacementAssignments);

  const patchedFirstAssignment =
    replacementAssignments || !patchesFirstAssignment
      ? null
      : await prepareAssignment({
          projectId: params.projectId,
          target: nextTarget,
          evaluator: params.input.evaluator
            ? {
                ...params.input.evaluator,
                // No current assignment to inherit a type from: the reference
                // schema's own default applies.
                type:
                  existingPublic.evaluator?.type ??
                  PUBLIC_EVALUATOR_TYPE_LLM_AS_JUDGE,
              }
            : {
                name: existingPublic.evaluator!.name,
                type: existingPublic.evaluator!.type,
              },
          mapping:
            "mapping" in params.input && params.input.mapping !== undefined
              ? params.input.mapping
              : toWritableMappingsIfComplete(existingPublic.mapping),
        });
  if (patchedFirstAssignment) {
    assertUniqueEvaluators([
      patchedFirstAssignment,
      ...existing.assignments.slice(1),
    ]);
  }

  // Assignments the rule ends up running with, whether or not this call rewrites them.
  const effectiveAssignments: PreparedAssignment[] = replacementAssignments ?? [
    ...(patchedFirstAssignment
      ? [patchedFirstAssignment]
      : firstAssignment
        ? [toPreparedExistingAssignment(firstAssignment, nextTarget)]
        : []),
    ...existing.assignments
      .slice(1)
      .map((assignment) =>
        toPreparedExistingAssignment(assignment, nextTarget),
      ),
  ];

  if (ruleFields.status === JobConfigState.ACTIVE) {
    await assertAssignmentsCanRun({
      orgId: params.orgId,
      projectId: params.projectId,
      assignments: effectiveAssignments,
      targetObject: ruleFields.targetObject,
      scoreName: ruleFields.scoreName,
      filter: updatesFilterOrTarget
        ? ruleFields.filter
        : (existing.filter as FilterCondition[]),
    });
  }

  const updated = await updateRuleWithRuleService({
    projectId: params.projectId,
    evaluationRuleId: params.evaluationRuleId,
    input: params.input,
    fields: ruleFields,
    existing,
    replacementAssignments,
    patchedFirstAssignment,
    effectiveAssignmentCount: effectiveAssignments.length,
    updatesFilterOrTarget,
  });
  const evaluationRule = toApiReadableV2EvaluationRule(updated);
  if (params.auditScope) {
    await auditLog({
      action: "update",
      resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
      resourceId: evaluationRule.id,
      projectId: params.projectId,
      orgId: params.auditScope.orgId,
      apiKeyId: params.auditScope.apiKeyId,
      before: existingPublic,
      after: evaluationRule,
    });
  }
  return evaluationRule;
}

function getPatchedFirstStoredMapping(params: {
  input: PatchUnstableEvaluationRuleBodyType;
  firstAssignment:
    | StoredPublicV2EvaluationRule["assignments"][number]
    | undefined;
  patchedFirstAssignment: PreparedAssignment;
}) {
  return !("mapping" in params.input) || params.input.mapping === undefined
    ? // Evaluator swapped without an explicit mapping: keep the stored
      // override so an inherited mapping stays inherited.
      (params.firstAssignment?.variableMapping ?? null)
    : params.patchedFirstAssignment.storedMapping;
}

async function updateRuleWithRuleService(params: {
  projectId: string;
  evaluationRuleId: string;
  input: PatchUnstableEvaluationRuleBodyType;
  fields: ReturnType<typeof toEvaluationRuleFields>;
  existing: StoredPublicV2EvaluationRule;
  replacementAssignments: PreparedAssignment[] | null;
  patchedFirstAssignment: PreparedAssignment | null;
  effectiveAssignmentCount: number;
  updatesFilterOrTarget: boolean;
}) {
  const firstAssignment = params.existing.assignments[0];
  const evaluatorMappings = params.replacementAssignments
    ? params.replacementAssignments.map((assignment) => ({
        evaluatorId: assignment.evaluatorId,
        variableMapping: assignment.storedMapping as
          | ObservationVariableMapping[]
          | null,
      }))
    : params.patchedFirstAssignment
      ? [
          {
            evaluatorId: params.patchedFirstAssignment.evaluatorId,
            variableMapping: getPatchedFirstStoredMapping({
              input: params.input,
              firstAssignment,
              patchedFirstAssignment: params.patchedFirstAssignment,
            }) as ObservationVariableMapping[] | null,
          },
          ...params.existing.assignments.slice(1).map((assignment) => ({
            evaluatorId: assignment.evaluatorId,
            variableMapping: assignment.variableMapping as
              | ObservationVariableMapping[]
              | null,
          })),
        ]
      : undefined;

  await runRuleServiceMutation(() =>
    ruleService.update({
      projectId: params.projectId,
      ruleId: params.evaluationRuleId,
      targetObject:
        params.updatesFilterOrTarget && "target" in params.input
          ? params.fields.targetObject
          : undefined,
      name: params.input.name,
      enabled:
        params.input.enabled === undefined
          ? undefined
          : params.effectiveAssignmentCount > 0 &&
            params.fields.status === JobConfigState.ACTIVE,
      sampling: params.input.sampling,
      filter: params.updatesFilterOrTarget
        ? (params.fields.filter as FilterState)
        : undefined,
      evaluatorMappings,
    }),
  );
  return findPublicV2EvaluationRuleOrThrow({
    projectId: params.projectId,
    evaluationRuleId: params.evaluationRuleId,
  });
}

/**
 * Existing stored assignment in the shape the preflight needs, resolving an
 * inherited (null) override against the evaluator version's default mapping.
 */
function toPreparedExistingAssignment(
  assignment: StoredPublicV2EvaluationRule["assignments"][number],
  target: PublicEvaluationRuleTargetType,
): PreparedAssignment {
  const template = toEvaluatorDefinition(assignment.evaluator);
  const inherited = assignment.variableMapping ?? template.variableMapping;
  return {
    evaluatorId: assignment.evaluatorId,
    template,
    storedMapping: assignment.variableMapping,
    effectiveMapping: toStoredAssignmentMapping({
      target,
      mapping:
        template.type === EvalTemplateType.CODE || inherited == null
          ? undefined
          : toApiMappings(inherited),
      evaluatorVariables: deriveEvaluatorVariables(template),
      evaluatorType: toPublicEvaluatorType(template.type),
    }),
  };
}

export async function deletePublicEvaluationRule(params: {
  projectId: string;
  evaluationRuleId: string;
  auditScope?: Pick<ApiAccessScope, "orgId" | "apiKeyId">;
}) {
  const existing = await findPublicWritableV2EvaluationRuleOrThrow(params);
  const existingPublic = toApiReadableV2EvaluationRule(existing);
  await runRuleServiceMutation(() =>
    ruleService.delete(params.projectId, params.evaluationRuleId),
  );
  if (params.auditScope) {
    await auditLog({
      action: "delete",
      resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
      resourceId: params.evaluationRuleId,
      projectId: params.projectId,
      orgId: params.auditScope.orgId,
      apiKeyId: params.auditScope.apiKeyId,
      before: existingPublic,
    });
  }
  return existing;
}
