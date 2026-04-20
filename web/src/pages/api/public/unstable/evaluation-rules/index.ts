import { auditLog } from "@/src/features/audit-logs/auditLog";
import { JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE } from "@/src/features/evals/server/audit-log-resource-types";
import {
  createPublicEvaluationRule,
  listPublicEvaluationRules,
} from "@/src/features/evals/server/unstable-public-api";
import {
  createUnstablePublicEvalsRoute,
  withUnstablePublicEvalsMiddlewares,
} from "@/src/features/public-api/server/unstable-public-evals-route";
import {
  GetUnstableEvaluationRulesQuery,
  GetUnstableEvaluationRulesResponse,
  PostUnstableEvaluationRuleBody,
  PostUnstableEvaluationRuleResponse,
} from "@/src/features/public-api/types/unstable-evaluation-rules";

export default withUnstablePublicEvalsMiddlewares({
  GET: createUnstablePublicEvalsRoute({
    name: "List Unstable Evaluation Rules",
    querySchema: GetUnstableEvaluationRulesQuery,
    responseSchema: GetUnstableEvaluationRulesResponse,
    fn: async ({ query, auth }) =>
      listPublicEvaluationRules({
        projectId: auth.scope.projectId,
        page: query.page,
        limit: query.limit,
      }),
  }),
  POST: createUnstablePublicEvalsRoute({
    name: "Create Unstable Evaluation Rule",
    bodySchema: PostUnstableEvaluationRuleBody,
    responseSchema: PostUnstableEvaluationRuleResponse,
    fn: async ({ body, auth }) => {
      const evaluationRule = await createPublicEvaluationRule({
        projectId: auth.scope.projectId,
        input: body,
      });

      await auditLog({
        action: "create",
        resourceType: JOB_CONFIGURATION_AUDIT_LOG_RESOURCE_TYPE,
        resourceId: evaluationRule.id,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
        after: evaluationRule,
      });

      return evaluationRule;
    },
  }),
});
