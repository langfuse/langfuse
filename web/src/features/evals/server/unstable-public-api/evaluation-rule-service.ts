import { invalidateProjectEvalConfigCaches } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { EvalTargetObject, JobConfigState } from "@langfuse/shared";
import type {
  PatchUnstableEvaluationRuleBodyType,
  PostUnstableEvaluationRuleBodyType,
} from "@/src/features/public-api/types/unstable-evaluation-rules";
import {
  deriveEvaluatorVariables,
  toApiEvaluationRule,
  toJobConfigurationInput,
} from "./adapters";
import {
  countActiveEvaluationRules,
  findPublicEvaluationRuleOrThrow,
  listPublicEvaluationRuleConfigs,
  loadEvaluatorForEvaluationRule,
} from "./queries";
import {
  assertEvaluationRuleFilterValuesExistForProject,
  assertEvaluatorDefinitionCanRunForPublicApi,
} from "./validation";
import { createUnstablePublicApiError } from "@/src/features/public-api/server/unstable-public-api-error-contract";

const MAX_ACTIVE_EVALUATION_RULES = 50;

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
  });

  if (data.status === JobConfigState.ACTIVE) {
    await assertEvaluatorDefinitionCanRunForPublicApi({
      projectId: params.projectId,
      template: {
        name: template.name,
        provider: template.provider,
        model: template.model,
        modelParams: template.modelParams,
        outputDefinition: template.outputDefinition,
      },
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
          vars: true,
          prompt: true,
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

  const nextEvaluator = params.input.evaluator ?? {
    name: existingPublic.evaluator.name,
    scope: existingPublic.evaluator.scope,
  };
  const { template } = await loadEvaluatorForEvaluationRule({
    projectId: params.projectId,
    evaluator: nextEvaluator,
  });
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
  });
  const shouldResetBlockState = data.status === JobConfigState.ACTIVE;

  if (shouldResetBlockState) {
    await assertEvaluatorDefinitionCanRunForPublicApi({
      projectId: params.projectId,
      template: {
        name: template.name,
        provider: template.provider,
        model: template.model,
        modelParams: template.modelParams,
        outputDefinition: template.outputDefinition,
      },
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
          vars: true,
          prompt: true,
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
