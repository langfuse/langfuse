import { EvalTargetObject } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import type { ApiAccessScope } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/server";
import {
  JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
  RuleService,
} from "@/src/features/evals/server";
import {
  type CreateEvaluationRuleBodyType,
  type UpdateEvaluationRuleBodyType,
} from "@/src/features/public-api/types/evaluation/evaluationRules";
import {
  encodeResourceCursor,
  type ResourceCursorType,
} from "@/src/features/public-api/types/evaluation/evaluators";
import {
  toInternalAssignments,
  toInternalFilters,
  toPublicRule,
} from "./evaluationAdapters";

function ruleService(auditScope: ApiAccessScope) {
  return new RuleService(prisma, ({ action, ruleId, projectId }) =>
    auditLog({
      action,
      resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
      resourceId: ruleId,
      projectId,
      orgId: auditScope.orgId,
      apiKeyId: auditScope.apiKeyId,
    }),
  );
}

export async function listEvaluationRulesForPublicApi(params: {
  projectId: string;
  limit: number;
  cursor?: ResourceCursorType;
  auditScope: ApiAccessScope;
}) {
  const result = await ruleService(params.auditScope).listCursor({
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
    data: result.rules.map(toPublicRule),
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

export async function getEvaluationRuleForPublicApi(params: {
  projectId: string;
  evaluationRuleId: string;
  auditScope: ApiAccessScope;
}) {
  return toPublicRule(
    await ruleService(params.auditScope).get(
      params.projectId,
      params.evaluationRuleId,
    ),
  );
}

export async function createEvaluationRuleForPublicApi(params: {
  projectId: string;
  input: CreateEvaluationRuleBodyType;
  auditScope: ApiAccessScope;
}) {
  return toPublicRule(
    await ruleService(params.auditScope).create(
      {
        projectId: params.projectId,
        name: params.input.name,
        targetObject: EvalTargetObject.EVENT,
        enabled: params.input.enabled,
        sampling: params.input.sampling,
        filter: toInternalFilters(params.input.filter),
        evaluatorAssignments: toInternalAssignments(
          params.input.evaluatorAssignments,
        ),
      },
      null,
    ),
  );
}

export async function updateEvaluationRuleForPublicApi(params: {
  projectId: string;
  evaluationRuleId: string;
  input: UpdateEvaluationRuleBodyType;
  auditScope: ApiAccessScope;
}) {
  return toPublicRule(
    await ruleService(params.auditScope).update({
      projectId: params.projectId,
      ruleId: params.evaluationRuleId,
      name: params.input.name,
      enabled: params.input.enabled,
      sampling: params.input.sampling,
      filter: params.input.filter
        ? toInternalFilters(params.input.filter)
        : undefined,
      evaluatorMappings: params.input.evaluatorAssignments
        ? toInternalAssignments(params.input.evaluatorAssignments)
        : undefined,
    }),
  );
}

export async function deleteEvaluationRuleForPublicApi(params: {
  projectId: string;
  evaluationRuleId: string;
  auditScope: ApiAccessScope;
}) {
  await ruleService(params.auditScope).delete(
    params.projectId,
    params.evaluationRuleId,
  );
  return { id: params.evaluationRuleId };
}
