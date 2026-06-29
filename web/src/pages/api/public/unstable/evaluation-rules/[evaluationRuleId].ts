import { auditLog } from "@/src/features/audit-logs/auditLog";
import { JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE } from "@/src/features/evals/server/audit-log-resource-types";
import {
  deletePublicEvaluationRule,
  getPublicEvaluationRule,
  updatePublicEvaluationRule,
} from "@/src/features/evals/server/unstable-public-api";
import {
  createUnstablePublicEvalsRoute,
  withUnstablePublicEvalsMiddlewares,
} from "@/src/features/public-api/server/unstable-public-evals-route";
import {
  DeleteUnstableEvaluationRuleQuery,
  DeleteUnstableEvaluationRuleResponse,
  GetUnstableEvaluationRuleQuery,
  GetUnstableEvaluationRuleResponse,
  PatchUnstableEvaluationRuleBody,
  PatchUnstableEvaluationRuleQuery,
  PatchUnstableEvaluationRuleResponse,
} from "@/src/features/public-api/types/unstable-evaluation-rules";

export default withUnstablePublicEvalsMiddlewares({
  GET: createUnstablePublicEvalsRoute({
    name: "Get Unstable Evaluation Rule",
    querySchema: GetUnstableEvaluationRuleQuery,
    responseSchema: GetUnstableEvaluationRuleResponse,
    fn: async ({ query, auth }) =>
      getPublicEvaluationRule({
        projectId: auth.scope.projectId,
        evaluationRuleId: query.evaluationRuleId,
      }),
  }),
  PATCH: createUnstablePublicEvalsRoute({
    name: "Update Unstable Evaluation Rule",
    querySchema: PatchUnstableEvaluationRuleQuery,
    bodySchema: PatchUnstableEvaluationRuleBody,
    responseSchema: PatchUnstableEvaluationRuleResponse,
    fn: async ({ query, body, auth }) => {
      const before = await getPublicEvaluationRule({
        projectId: auth.scope.projectId,
        evaluationRuleId: query.evaluationRuleId,
      });

      const evaluationRule = await updatePublicEvaluationRule({
        projectId: auth.scope.projectId,
        evaluationRuleId: query.evaluationRuleId,
        input: body,
      });

      await auditLog({
        action: "update",
        resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
        resourceId: evaluationRule.id,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
        before,
        after: evaluationRule,
      });

      return evaluationRule;
    },
  }),
  DELETE: createUnstablePublicEvalsRoute({
    name: "Delete Unstable Evaluation Rule",
    querySchema: DeleteUnstableEvaluationRuleQuery,
    responseSchema: DeleteUnstableEvaluationRuleResponse,
    fn: async ({ query, auth }) => {
      const before = await getPublicEvaluationRule({
        projectId: auth.scope.projectId,
        evaluationRuleId: query.evaluationRuleId,
      });

      await deletePublicEvaluationRule({
        projectId: auth.scope.projectId,
        evaluationRuleId: query.evaluationRuleId,
      });

      await auditLog({
        action: "delete",
        resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
        resourceId: query.evaluationRuleId,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
        before,
      });

      return {
        message: "Evaluation rule successfully deleted" as const,
      };
    },
  }),
});
