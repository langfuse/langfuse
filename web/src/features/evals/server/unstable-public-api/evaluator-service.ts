import {
  EvalTemplateType,
  extractVariables,
  LangfuseConflictError,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import type { ApiAccessScope } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { EVAL_TEMPLATE_AUDIT_LOG_RESOURCE_TYPE } from "@/src/features/evals/server/audit-log-resource-types";
import {
  isCodeEvalEnabled,
  isCodeEvalSourceCodeLanguageSupported,
} from "@/src/features/evals/server/isCodeEvalEnabled";
import type { EvaluatorDefinition } from "@/src/features/evals/v2/server/evaluators/evaluatorTypes";
import { EvaluatorService } from "@/src/features/evals/v2/server/evaluators/evaluatorService";
import {
  EvaluatorConfigurationError,
  EvaluatorVersionConflictError,
} from "@/src/features/evals/v2/server/evaluators/evaluatorErrors";
import { AssignmentService } from "@/src/features/evals/v2/server/assignments/assignmentService";
import { createUnstablePublicApiError } from "@/src/features/public-api/server/unstable-public-api-error-contract";
import type { PostUnstableEvaluatorBodyParsedType } from "@/src/features/public-api/types/unstable-evaluators";
import { PUBLIC_EVALUATOR_TYPE_CODE } from "@/src/features/public-api/types/unstable-public-evals-contract";
import { toApiEvaluator, toStoredOutputDefinition } from "./adapters";
import type { StoredPublicEvaluatorTemplate } from "./types";

function serviceForPublicApi(params?: {
  projectId: string;
  auditScope?: Pick<ApiAccessScope, "orgId" | "apiKeyId">;
}) {
  return new EvaluatorService({
    prisma,
    audit: params?.auditScope
      ? ({ action, evaluatorId }) =>
          auditPublicEvaluator(params, action, evaluatorId)
      : undefined,
  });
}

function assignmentServiceForPublicApi() {
  return new AssignmentService({ prisma });
}

function auditPublicEvaluator(
  params: {
    projectId: string;
    auditScope?: Pick<ApiAccessScope, "orgId" | "apiKeyId">;
  },
  action: "create" | "update" | "delete",
  evaluatorId: string,
) {
  if (!params.auditScope) return Promise.resolve();
  return auditLog({
    action,
    resourceType: EVAL_TEMPLATE_AUDIT_LOG_RESOURCE_TYPE,
    resourceId: evaluatorId,
    projectId: params.projectId,
    orgId: params.auditScope.orgId,
    apiKeyId: params.auditScope.apiKeyId,
  });
}

function assertCodeEvaluatorDefinitionCanRunForPublicApi(
  input: Extract<
    PostUnstableEvaluatorBodyParsedType,
    { type: typeof PUBLIC_EVALUATOR_TYPE_CODE }
  >,
) {
  if (!isCodeEvalEnabled()) {
    throw createUnstablePublicApiError({
      httpCode: 403,
      code: "access_denied",
      message: "Code evals are not enabled",
    });
  }

  if (!isCodeEvalSourceCodeLanguageSupported(input.sourceCodeLanguage)) {
    throw createUnstablePublicApiError({
      httpCode: 400,
      code: "invalid_request",
      message:
        "This code evaluator language is not supported by the configured dispatcher.",
      details: {
        field: "sourceCodeLanguage",
        value: input.sourceCodeLanguage,
      },
    });
  }
}

function toDefinition(
  input: PostUnstableEvaluatorBodyParsedType,
): EvaluatorDefinition {
  if (input.type === PUBLIC_EVALUATOR_TYPE_CODE) {
    return {
      type: EvalTemplateType.CODE,
      sourceCode: input.sourceCode,
      sourceCodeLanguage: input.sourceCodeLanguage,
      variableMapping: null,
    };
  }

  return {
    type: EvalTemplateType.LLM_AS_JUDGE,
    prompt: input.prompt,
    provider: input.modelConfig?.provider ?? null,
    model: input.modelConfig?.model ?? null,
    modelParams: null,
    vars: extractVariables(input.prompt),
    variableMapping: null,
    outputDefinition: toStoredOutputDefinition(input.outputDefinition),
  };
}

type StableEvaluator = Awaited<ReturnType<EvaluatorService["get"]>>;

function toLatestTemplate(
  evaluator: StableEvaluator,
): StoredPublicEvaluatorTemplate {
  const version = evaluator.versions[0];
  if (!version) {
    throw createUnstablePublicApiError({
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
    partner: version.partner,
    provider: version.provider,
    model: version.model,
    modelParams: version.modelParams,
    vars: version.vars,
    outputDefinition: version.outputDefinition,
    sourceCode: version.sourceCode,
    sourceCodeLanguage: version.sourceCodeLanguage,
    createdAt: evaluator.createdAt,
    updatedAt: evaluator.updatedAt,
  };
}

function toPublicEvaluator(
  evaluator: StableEvaluator,
  evaluationRuleCount = 0,
) {
  return toApiEvaluator({
    template: toLatestTemplate(evaluator),
    evaluationRuleCount,
  });
}

export async function listPublicEvaluators(params: {
  projectId: string;
  page: number;
  limit: number;
}) {
  const service = serviceForPublicApi();
  const assignmentService = assignmentServiceForPublicApi();
  const { evaluators, totalItems } = await service.list(params);
  const ruleCounts =
    await assignmentService.countEvaluatorAssignmentsForEvaluators(
      params.projectId,
      evaluators.map((evaluator) => evaluator.id),
    );
  return {
    data: evaluators.map((evaluator) =>
      toPublicEvaluator(evaluator, ruleCounts[evaluator.id] ?? 0),
    ),
    meta: {
      page: params.page,
      limit: params.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / params.limit),
    },
  };
}

export async function getPublicEvaluator(params: {
  projectId: string;
  evaluatorId: string;
}) {
  const service = serviceForPublicApi();
  const evaluator = await service.get(params.projectId, params.evaluatorId);
  const ruleCount =
    await assignmentServiceForPublicApi().countEvaluatorAssignments(
      params.projectId,
      evaluator.id,
    );
  return toPublicEvaluator(evaluator, ruleCount);
}

export async function createPublicEvaluator(params: {
  projectId: string;
  input: PostUnstableEvaluatorBodyParsedType;
  auditScope?: Pick<ApiAccessScope, "orgId" | "apiKeyId">;
}) {
  const { input } = params;
  const definition = toDefinition(input);

  if (input.type === PUBLIC_EVALUATOR_TYPE_CODE) {
    assertCodeEvaluatorDefinitionCanRunForPublicApi(input);
  }

  const service = serviceForPublicApi(params);
  try {
    const result = await service.upsertByName(
      {
        projectId: params.projectId,
        name: input.name,
        description: null,
        definition,
      },
      null,
    );
    const { evaluator } = result;
    const ruleCount =
      await assignmentServiceForPublicApi().countEvaluatorAssignments(
        params.projectId,
        evaluator.id,
      );
    return toPublicEvaluator(evaluator, ruleCount);
  } catch (error) {
    if (error instanceof EvaluatorConfigurationError) {
      throw createUnstablePublicApiError({
        httpCode: 422,
        code: "evaluator_preflight_failed",
        message: error.message,
        details: {
          evaluatorName: input.name,
          provider:
            input.type === PUBLIC_EVALUATOR_TYPE_CODE
              ? null
              : (input.modelConfig?.provider ?? null),
          model:
            input.type === PUBLIC_EVALUATOR_TYPE_CODE
              ? null
              : (input.modelConfig?.model ?? null),
        },
      });
    }
    if (error instanceof EvaluatorVersionConflictError) {
      throw createUnstablePublicApiError({
        httpCode: 409,
        code: "conflict",
        message: error.message,
      });
    }
    if (error instanceof LangfuseConflictError) {
      throw createUnstablePublicApiError({
        httpCode: 409,
        code: "name_conflict",
        message: error.message,
        details: { field: "name" },
      });
    }
    throw error;
  }
}

export async function deletePublicEvaluator(params: {
  projectId: string;
  evaluatorId: string;
  auditScope?: Pick<ApiAccessScope, "orgId" | "apiKeyId">;
}) {
  const service = serviceForPublicApi(params);
  await service.delete(params.projectId, params.evaluatorId);
}
