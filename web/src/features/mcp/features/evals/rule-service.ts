import { auditLog } from "@/src/features/audit-logs/auditLog";
import { JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE } from "@/src/features/evals/server/audit-log-resource-types";
import {
  toApiReadMappings,
  toPublicEvaluatorType,
  toStoredMappingList,
} from "@/src/features/evals/server/unstable-public-api/adapters";
import { RuleService } from "@/src/features/evals/v2/server/rules/ruleService";
import { prisma } from "@langfuse/shared/src/db";
import type { z } from "zod";
import type { ServerContext } from "../../types";
import {
  EvaluationRuleResponseSchema,
  type EvaluationRuleAssignmentInput,
} from "./rule-schema";

export function createMcpRuleService(context: ServerContext) {
  return new RuleService(prisma, ({ action, ruleId }) =>
    auditLog({
      action,
      resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
      resourceId: ruleId,
      projectId: context.projectId,
      orgId: context.orgId,
      apiKeyId: context.apiKeyId,
    }),
  );
}

/** Public mapping contract in, stored mapping columns out. */
export function toStoredAssignments(
  assignments: EvaluationRuleAssignmentInput[],
) {
  return assignments.map((assignment) => ({
    evaluatorId: assignment.evaluatorId,
    variableMapping:
      assignment.variableMapping === undefined
        ? null
        : toStoredMappingList(assignment.variableMapping),
  }));
}

type StoredRule = Awaited<ReturnType<RuleService["get"]>>;

export function toMcpEvaluationRule(
  rule: StoredRule,
): z.infer<typeof EvaluationRuleResponseSchema> {
  return EvaluationRuleResponseSchema.parse({
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    sampling: rule.sampling,
    filter: rule.filter,
    evaluators: rule.assignments.map((assignment) => ({
      evaluatorId: assignment.evaluator.id,
      evaluatorName: assignment.evaluator.name,
      evaluatorType: toPublicEvaluatorType(assignment.evaluator.type),
      variableMapping:
        assignment.variableMapping === null
          ? null
          : toApiReadMappings(assignment.variableMapping),
    })),
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  });
}
