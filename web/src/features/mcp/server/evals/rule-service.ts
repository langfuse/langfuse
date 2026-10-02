import { auditLog } from "@/src/features/audit-logs/server";
import { JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE } from "@/src/features/evals/server/audit-log-resource-types";
import {
  toApiReadMappings,
  toStoredMappingList,
} from "@/src/features/public-api/server";
import { RuleService } from "@/src/features/evals/v2/server/rules/ruleService";
import {
  EvalTemplateType,
  InvalidRequestError,
  type EvalTemplateType as EvalTemplateTypeValue,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import type { z } from "zod";
import type { ServerContext } from "../../types";
import {
  McpEvaluatorType,
  EvaluationRuleResponseSchema,
  type EvaluationRuleAssignmentInput,
} from "./rule-schema";

const MCP_EVALUATOR_TYPES = new Set<EvalTemplateTypeValue>([
  EvalTemplateType.LLM_AS_JUDGE,
  EvalTemplateType.CODE,
  EvalTemplateType.DECISION_MODEL,
]);

function isMcpEvaluatorType(type: EvalTemplateTypeValue) {
  return MCP_EVALUATOR_TYPES.has(type);
}

function toMcpEvaluatorType(type: EvalTemplateTypeValue) {
  return McpEvaluatorType.parse(
    type === EvalTemplateType.LLM_AS_JUDGE
      ? "llm_as_judge"
      : type === EvalTemplateType.CODE
        ? "code"
        : type === EvalTemplateType.DECISION_MODEL
          ? "decision_model"
          : type,
  );
}

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

export async function assertRuleAssignmentsReplaceableViaMcp(
  service: RuleService,
  projectId: string,
  ruleId: string,
) {
  const rule = await service.get(projectId, ruleId);
  const hidden = rule.assignments.filter(
    (assignment) => !isMcpEvaluatorType(assignment.evaluator.type),
  );
  if (hidden.length > 0) {
    throw new InvalidRequestError(
      "This rule uses internal evaluators that are not visible through MCP. Update its evaluator assignments in the Langfuse UI.",
    );
  }
}

export function toMcpEvaluationRule(
  rule: StoredRule,
): z.infer<typeof EvaluationRuleResponseSchema> {
  return EvaluationRuleResponseSchema.parse({
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    sampling: rule.sampling,
    filter: rule.filter,
    evaluators: rule.assignments
      .filter((assignment) => isMcpEvaluatorType(assignment.evaluator.type))
      .map((assignment) => ({
        evaluatorId: assignment.evaluator.id,
        evaluatorName: assignment.evaluator.name,
        evaluatorType: toMcpEvaluatorType(assignment.evaluator.type),
        variableMapping:
          assignment.variableMapping === null
            ? null
            : toApiReadMappings(assignment.variableMapping),
      })),
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  });
}
