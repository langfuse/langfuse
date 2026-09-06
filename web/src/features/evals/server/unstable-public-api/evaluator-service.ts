import {
  EvalTemplateType,
  extractVariables,
  LangfuseConflictError,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  invalidateProjectEvalConfigCaches,
  type ApiAccessScope,
} from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { EVAL_TEMPLATE_AUDIT_LOG_RESOURCE_TYPE } from "@/src/features/evals/server/audit-log-resource-types";
import {
  isCodeEvalEnabled,
  isCodeEvalSourceCodeLanguageSupported,
} from "@/src/features/evals/server/isCodeEvalEnabled";
import type { EvaluatorDefinition } from "@/src/features/evals/v2/server/evaluators/evaluatorTypes";
import {
  EvaluatorService,
  reconcileEvaluatorPromptMessages,
} from "@/src/features/evals/v2/server/evaluators/evaluatorService";
import {
  EvaluatorConfigurationError,
  EvaluatorVersionConflictError,
} from "@/src/features/evals/v2/server/evaluators/evaluatorErrors";
import { RuleService } from "@/src/features/evals/v2/server/rules/ruleService";
import { createStructuredPublicApiError } from "@/src/features/public-api";
import {
  type PostUnstableEvaluatorBodyParsedType,
  PUBLIC_EVALUATOR_TYPE_CODE,
} from "@/src/features/public-api/server";
import {
  toApiEvaluator,
  toStoredOutputDefinition,
  toStoredVariableMappings,
} from "./adapters";
import type { StoredPublicEvaluatorTemplate } from "./types";

function readServiceForPublicApi() {
  return new EvaluatorService(prisma, async () => undefined);
}

function serviceForPublicApi(params: {
  projectId: string;
  auditScope?: Pick<ApiAccessScope, "orgId" | "apiKeyId">;
}) {
  return new EvaluatorService(prisma, ({ action, evaluatorId }) =>
    auditPublicEvaluator(params, action, evaluatorId),
  );
}

function ruleServiceForPublicApi() {
  return new RuleService(prisma, async () => undefined);
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
    throw createStructuredPublicApiError({
      httpCode: 403,
      code: "access_denied",
      message: "Code evals are not enabled",
    });
  }

  if (!isCodeEvalSourceCodeLanguageSupported(input.sourceCodeLanguage)) {
    throw createStructuredPublicApiError({
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
    };
  }

  return {
    type: EvalTemplateType.LLM_AS_JUDGE,
    promptMessages: reconcileEvaluatorPromptMessages({ prompt: input.prompt }),
    provider: input.modelConfig?.provider ?? null,
    model: input.modelConfig?.model ?? null,
    modelParams: null,
    vars: extractVariables(input.prompt),
    variableMapping:
      input.mapping === undefined
        ? null
        : toStoredVariableMappings({
            mappings: input.mapping,
            variables: extractVariables(input.prompt),
            target: "observation",
          }),
    outputDefinition: toStoredOutputDefinition(input.outputDefinition),
  };
}

type StableEvaluator =
  | Awaited<ReturnType<EvaluatorService["get"]>>
  | Awaited<ReturnType<EvaluatorService["list"]>>["evaluators"][number];

function toLatestTemplate(
  evaluator: StableEvaluator,
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
    prompt: null,
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
  const service = readServiceForPublicApi();
  const ruleService = ruleServiceForPublicApi();
  const { evaluators, totalItems } = await service.list(params);
  const evaluatorIds = evaluators.map((evaluator) => evaluator.id);
  const assignmentCounts = await ruleService.countRulesForEvaluators(
    params.projectId,
    evaluatorIds,
  );
  return {
    data: evaluators.map((evaluator) =>
      toPublicEvaluator(evaluator, assignmentCounts[evaluator.id] ?? 0),
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
  const service = readServiceForPublicApi();
  const evaluator = await service.get(params.projectId, params.evaluatorId);
  const ruleCounts = await ruleServiceForPublicApi().countRulesForEvaluators(
    params.projectId,
    [evaluator.id],
  );
  return toPublicEvaluator(evaluator, ruleCounts[evaluator.id] ?? 0);
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
    const ruleCounts = await ruleServiceForPublicApi().countRulesForEvaluators(
      params.projectId,
      [evaluator.id],
    );
    return toPublicEvaluator(evaluator, ruleCounts[evaluator.id] ?? 0);
  } catch (error) {
    if (error instanceof EvaluatorConfigurationError) {
      throw createStructuredPublicApiError({
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
      throw createStructuredPublicApiError({
        httpCode: 409,
        code: "conflict",
        message: error.message,
      });
    }
    if (error instanceof LangfuseConflictError) {
      throw createStructuredPublicApiError({
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
  await service.get(params.projectId, params.evaluatorId);
  await service.delete(params.projectId, params.evaluatorId);
  await invalidateProjectEvalConfigCaches(params.projectId);
}
