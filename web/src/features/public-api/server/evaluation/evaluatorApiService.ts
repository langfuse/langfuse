import { EvalTemplateType, ZodModelConfig } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import type { ApiAccessScope } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/server";
import {
  EVAL_TEMPLATE_AUDIT_LOG_RESOURCE_TYPE,
  EvaluatorService,
} from "@/src/features/evals/server";
import {
  encodeResourceCursor,
  type CreateEvaluatorBodyType,
  type ResourceCursorType,
  type UpdateEvaluatorBodyType,
} from "@/src/features/public-api/types/evaluation/evaluators";
import {
  toEvaluatorServiceDefinition,
  toPublicEvaluator,
  toPublicEvaluatorVersion,
} from "./evaluationAdapters";

function evaluatorService(auditScope: ApiAccessScope) {
  return new EvaluatorService(prisma, ({ action, evaluatorId, projectId }) =>
    auditLog({
      action,
      resourceType: EVAL_TEMPLATE_AUDIT_LOG_RESOURCE_TYPE,
      resourceId: evaluatorId,
      projectId,
      orgId: auditScope.orgId,
      apiKeyId: auditScope.apiKeyId,
    }),
  );
}

export async function listEvaluatorsForPublicApi(params: {
  projectId: string;
  limit: number;
  cursor?: ResourceCursorType;
  auditScope: ApiAccessScope;
}) {
  const result = await evaluatorService(params.auditScope).listCursor({
    projectId: params.projectId,
    limit: params.limit,
    cursor: params.cursor
      ? {
          createdAt: new Date(params.cursor.lastCreatedAt),
          id: params.cursor.lastId,
        }
      : undefined,
  });
  return {
    data: result.evaluators.map(toPublicEvaluator),
    meta: result.nextCursor
      ? {
          cursor: encodeResourceCursor({
            v: 1,
            lastCreatedAt: result.nextCursor.createdAt.toISOString(),
            lastId: result.nextCursor.id,
          }),
        }
      : {},
  };
}

export async function getEvaluatorForPublicApi(params: {
  projectId: string;
  evaluatorId: string;
  auditScope: ApiAccessScope;
}) {
  return toPublicEvaluator(
    await evaluatorService(params.auditScope).get(
      params.projectId,
      params.evaluatorId,
    ),
  );
}

export async function createEvaluatorForPublicApi(params: {
  projectId: string;
  input: CreateEvaluatorBodyType;
  auditScope: ApiAccessScope;
}) {
  return toPublicEvaluator(
    await evaluatorService(params.auditScope).create(
      {
        projectId: params.projectId,
        name: params.input.name,
        description: params.input.description ?? null,
        definition: toEvaluatorServiceDefinition(params.input),
      },
      null,
    ),
  );
}

export async function updateEvaluatorForPublicApi(params: {
  projectId: string;
  evaluatorId: string;
  input: UpdateEvaluatorBodyType;
  auditScope: ApiAccessScope;
}) {
  const service = evaluatorService(params.auditScope);
  let definition =
    "type" in params.input
      ? toEvaluatorServiceDefinition(params.input)
      : undefined;

  if (
    definition?.type === EvalTemplateType.LLM_AS_JUDGE &&
    "type" in params.input &&
    params.input.type === "llm_as_judge" &&
    params.input.modelConfig === undefined
  ) {
    const current = await service.get(params.projectId, params.evaluatorId);
    const latestVersion = current.versions[0];
    if (current.type === EvalTemplateType.LLM_AS_JUDGE && latestVersion) {
      definition = {
        ...definition,
        provider: latestVersion.provider,
        model: latestVersion.model,
        modelParams: ZodModelConfig.nullable().parse(latestVersion.modelParams),
      };
    }
  }

  return toPublicEvaluator(
    await service.patch(
      {
        projectId: params.projectId,
        evaluatorId: params.evaluatorId,
        name: params.input.name,
        description: params.input.description,
        definition,
      },
      null,
    ),
  );
}

export async function deleteEvaluatorForPublicApi(params: {
  projectId: string;
  evaluatorId: string;
  auditScope: ApiAccessScope;
}) {
  await evaluatorService(params.auditScope).delete(
    params.projectId,
    params.evaluatorId,
  );
  return { id: params.evaluatorId };
}

export async function listEvaluatorVersionsForPublicApi(params: {
  projectId: string;
  evaluatorId: string;
  limit: number;
  cursor?: { v: 1; version: number };
  auditScope: ApiAccessScope;
}) {
  const result = await evaluatorService(params.auditScope).listVersions({
    projectId: params.projectId,
    evaluatorId: params.evaluatorId,
    limit: params.limit,
    cursor: params.cursor,
  });
  return {
    data: result.data.map((version) =>
      toPublicEvaluatorVersion(version.evaluator.type, version),
    ),
    meta: result.nextCursor ? { cursor: result.nextCursor } : {},
  };
}
