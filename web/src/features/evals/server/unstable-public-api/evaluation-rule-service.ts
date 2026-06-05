import { TRPCError } from "@trpc/server";
import { invalidateProjectEvalConfigCaches } from "@langfuse/shared/src/server";
import { EvalTemplateType, prisma } from "@langfuse/shared/src/db";
import {
  EvalTargetObject,
  JobConfigState,
  type FilterCondition,
} from "@langfuse/shared";
import {
  assertCodeEvalJobConfigCanRun,
  CodeEvalJobConfigInvalidTargetError,
  CodeEvalJobConfigPreflightError,
} from "@/src/features/evals/server/codeEvalJobConfigValidation";
import {
  isCodeEvalEnabled,
  isCodeEvalSourceCodeLanguageSupported,
} from "@/src/features/evals/server/isCodeEvalEnabled";
import type {
  PatchUnstableEvaluationRuleBodyType,
  PostUnstableEvaluationRuleBodyType,
} from "@/src/features/public-api/types/unstable-evaluation-rules";
import {
  deriveEvaluatorVariables,
  toApiEvaluationRule,
  toJobConfigurationInput,
  toPublicEvaluatorType,
} from "./adapters";
import {
  countActiveEvaluationRules,
  findPublicEvaluationRuleOrThrow,
  listPublicEvaluationRuleConfigs,
  loadEvaluatorForEvaluationRule,
} from "./queries";
import type { StoredPublicEvaluatorTemplate } from "./types";
import {
  assertEvaluationRuleFilterValuesExistForProject,
  assertEvaluatorDefinitionCanRunForPublicApi,
} from "./validation";
import { createUnstablePublicApiError } from "@/src/features/public-api/server/unstable-public-api-error-contract";

const MAX_ACTIVE_EVALUATION_RULES = 50;

async function assertEvaluationRuleCanRunForPublicApi(params: {
  orgId: string;
  projectId: string;
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

  // Code evaluators only run when the project has a configured dispatcher that
  // supports the template language. Reject here so we never persist an active
  // rule that would silently fail at execution time, matching the create path.
  if (!isCodeEvalEnabled()) {
    throw createUnstablePublicApiError({
      httpCode: 403,
      code: "access_denied",
      message: "Code evals are not enabled",
      details: {
        evaluatorName: params.template.name,
      },
    });
  }

  if (
    !isCodeEvalSourceCodeLanguageSupported(params.template.sourceCodeLanguage)
  ) {
    throw createUnstablePublicApiError({
      httpCode: 400,
      code: "invalid_request",
      message:
        "This code evaluator language is not supported by the configured dispatcher.",
      details: {
        evaluatorName: params.template.name,
      },
    });
  }

  try {
    await assertCodeEvalJobConfigCanRun({
      prisma,
      orgId: params.orgId,
      projectId: params.projectId,
      evalTemplateId: params.template.id,
      target: params.target,
      mapping: params.mapping,
      scoreName: params.scoreName,
      filter: params.filter,
    });
  } catch (error) {
    if (error instanceof CodeEvalJobConfigInvalidTargetError) {
      throw createUnstablePublicApiError({
        httpCode: 400,
        code: "invalid_request",
        message: error.message,
        details: {
          evaluatorName: params.template.name,
        },
      });
    }

    if (error instanceof CodeEvalJobConfigPreflightError) {
      throw createUnstablePublicApiError({
        httpCode: 422,
        code: "evaluator_preflight_failed",
        message: error.message,
        details: {
          evaluatorName: params.template.name,
        },
      });
    }

    // The shared code-eval preflight (`runCodeEvalTestForObservation`) still
    // throws raw TRPCErrors for dispatcher/template/language failures because it
    // is also consumed by the tRPC test endpoint. Translate them here so the
    // public API returns its documented structured errors instead of a 500.
    if (error instanceof TRPCError) {
      throw createUnstablePublicApiError({
        httpCode:
          error.code === "NOT_FOUND"
            ? 404
            : error.code === "BAD_REQUEST"
              ? 400
              : 422,
        code:
          error.code === "NOT_FOUND"
            ? "resource_not_found"
            : error.code === "BAD_REQUEST"
              ? "invalid_request"
              : "evaluator_preflight_failed",
        message: error.message,
        details: {
          evaluatorName: params.template.name,
        },
      });
    }

    throw error;
  }
}

async function assertActivePublicApiEvaluationRuleLimitNotExceeded(
  projectId: string,
) {
  const activeCount = await countActiveEvaluationRules({ projectId });

  if (activeCount >= MAX_ACTIVE_EVALUATION_RULES) {
    throw createUnstablePublicApiError({
      httpCode: 409,
      code: "conflict",
      message: `This project already has the maximum number of active evaluation rules (${MAX_ACTIVE_EVALUATION_RULES}). Disable an existing active evaluation rule before enabling another one.`,
      details: {
        limit: MAX_ACTIVE_EVALUATION_RULES,
      },
    });
  }
}

export async function listPublicEvaluationRules(params: {
  projectId: string;
  page: number;
  limit: number;
}) {
  const { configs, totalItems } = await listPublicEvaluationRuleConfigs(params);

  return {
    data: configs.map((config) => toApiEvaluationRule(config)),
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
  const config = await findPublicEvaluationRuleOrThrow(params);
  return toApiEvaluationRule(config);
}

export async function createPublicEvaluationRule(params: {
  orgId: string;
  projectId: string;
  input: PostUnstableEvaluationRuleBodyType;
}) {
  const existing = await prisma.jobConfiguration.findFirst({
    where: {
      projectId: params.projectId,
      jobType: "EVAL",
      targetObject: {
        in: [EvalTargetObject.EVENT, EvalTargetObject.EXPERIMENT],
      },
      scoreName: params.input.name,
      evalTemplate: {
        is: {
          OR: [{ projectId: params.projectId }, { projectId: null }],
        },
      },
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    throw createUnstablePublicApiError({
      httpCode: 409,
      code: "name_conflict",
      message: `An evaluation rule named "${params.input.name}" already exists in this project. Use PATCH /api/public/unstable/evaluation-rules/${existing.id} to update it instead of creating a duplicate.`,
      details: {
        field: "name",
      },
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

  const { template } = await loadEvaluatorForEvaluationRule({
    projectId: params.projectId,
    evaluator: params.input.evaluator,
  });

  const data = toJobConfigurationInput({
    input: {
      name: params.input.name,
      target: params.input.target,
      enabled: params.input.enabled,
      sampling: params.input.sampling,
      filter: params.input.filter,
      mapping: params.input.mapping,
    },
    evaluatorVariables: deriveEvaluatorVariables(template),
    evaluatorType: toPublicEvaluatorType(template.type),
  });

  if (data.status === JobConfigState.ACTIVE) {
    await assertEvaluationRuleCanRunForPublicApi({
      orgId: params.orgId,
      projectId: params.projectId,
      template,
      target: data.targetObject as EvalTargetObject,
      mapping: data.variableMapping,
      scoreName: data.scoreName,
      filter: data.filter,
    });
  }

  const created = await prisma.jobConfiguration.create({
    data: {
      projectId: params.projectId,
      jobType: "EVAL",
      evalTemplateId: template.id,
      scoreName: data.scoreName,
      targetObject: data.targetObject,
      filter: data.filter,
      variableMapping: data.variableMapping,
      sampling: data.sampling,
      delay: 0,
      status: data.status,
      timeScope: ["NEW"],
    },
    include: {
      evalTemplate: {
        select: {
          id: true,
          projectId: true,
          name: true,
          type: true,
        },
      },
    },
  });

  if (created.status === JobConfigState.ACTIVE) {
    await invalidateProjectEvalConfigCaches(params.projectId);
  }

  return toApiEvaluationRule(created);
}

export async function updatePublicEvaluationRule(params: {
  orgId: string;
  projectId: string;
  evaluationRuleId: string;
  input: PatchUnstableEvaluationRuleBodyType;
}) {
  const existing = await findPublicEvaluationRuleOrThrow({
    projectId: params.projectId,
    evaluationRuleId: params.evaluationRuleId,
  });
  const existingPublic = toApiEvaluationRule(existing);
  const nextEnabled = params.input.enabled ?? existingPublic.enabled;
  const shouldCountAgainstActiveLimit =
    nextEnabled && existingPublic.status !== "active";

  if (shouldCountAgainstActiveLimit) {
    await assertActivePublicApiEvaluationRuleLimitNotExceeded(params.projectId);
  }

  const nextTarget =
    "target" in params.input && params.input.target !== undefined
      ? params.input.target
      : existingPublic.target;
  if ("filter" in params.input && params.input.filter !== undefined) {
    await assertEvaluationRuleFilterValuesExistForProject({
      projectId: params.projectId,
      target: nextTarget,
      filters: params.input.filter,
    });
  }

  // When a PATCH references an evaluator but omits `type`, keep the rule's
  // current evaluator type instead of defaulting to llm_as_judge, so a code
  // rule is not silently retargeted to an LLM evaluator family.
  const nextEvaluator = params.input.evaluator
    ? {
        name: params.input.evaluator.name,
        scope: params.input.evaluator.scope,
        type: params.input.evaluator.type ?? existingPublic.evaluator.type,
      }
    : {
        name: existingPublic.evaluator.name,
        scope: existingPublic.evaluator.scope,
        type: existingPublic.evaluator.type,
      };
  const { template } = await loadEvaluatorForEvaluationRule({
    projectId: params.projectId,
    evaluator: nextEvaluator,
  });

  if (
    template.type === EvalTemplateType.CODE &&
    "mapping" in params.input &&
    params.input.mapping !== undefined
  ) {
    throw createUnstablePublicApiError({
      httpCode: 400,
      code: "invalid_body",
      message:
        "Code evaluator mappings are managed by Langfuse and cannot be provided in the request body.",
      details: {
        field: "mapping",
      },
    });
  }

  const nextFilter =
    "filter" in params.input && params.input.filter !== undefined
      ? params.input.filter
      : existingPublic.filter;
  const nextMapping =
    "mapping" in params.input && params.input.mapping !== undefined
      ? params.input.mapping
      : existingPublic.mapping;

  const data = toJobConfigurationInput({
    input: {
      name: params.input.name ?? existingPublic.name,
      target: nextTarget,
      enabled: params.input.enabled ?? existingPublic.enabled,
      sampling: params.input.sampling ?? existingPublic.sampling,
      filter: nextFilter,
      mapping: nextMapping,
    },
    evaluatorVariables: deriveEvaluatorVariables(template),
    evaluatorType: toPublicEvaluatorType(template.type),
  });
  const shouldResetBlockState = data.status === JobConfigState.ACTIVE;

  if (shouldResetBlockState) {
    await assertEvaluationRuleCanRunForPublicApi({
      orgId: params.orgId,
      projectId: params.projectId,
      template,
      target: data.targetObject as EvalTargetObject,
      mapping: data.variableMapping,
      scoreName: data.scoreName,
      filter: data.filter,
    });
  }

  const updated = await prisma.jobConfiguration.update({
    where: {
      id: params.evaluationRuleId,
      projectId: params.projectId,
    },
    data: {
      evalTemplateId: template.id,
      scoreName: data.scoreName,
      targetObject: data.targetObject,
      filter: data.filter,
      variableMapping: data.variableMapping,
      sampling: data.sampling,
      status: data.status,
      ...(shouldResetBlockState
        ? {
            blockedAt: null,
            blockReason: null,
            blockMessage: null,
          }
        : {}),
    },
    include: {
      evalTemplate: {
        select: {
          id: true,
          projectId: true,
          name: true,
          type: true,
        },
      },
    },
  });

  await invalidateProjectEvalConfigCaches(params.projectId);

  return toApiEvaluationRule(updated);
}

export async function deletePublicEvaluationRule(params: {
  projectId: string;
  evaluationRuleId: string;
}) {
  const existing = await findPublicEvaluationRuleOrThrow(params);

  await prisma.jobConfiguration.delete({
    where: {
      id: params.evaluationRuleId,
      projectId: params.projectId,
    },
  });

  await invalidateProjectEvalConfigCaches(params.projectId);

  return existing;
}
