import { auditLog } from "@/src/features/audit-logs/auditLog";
import { EVAL_TEMPLATE_AUDIT_LOG_RESOURCE_TYPE } from "@/src/features/evals/server/audit-log-resource-types";
import {
  createPublicEvaluator,
  listPublicEvaluators,
} from "@/src/features/evals/server/unstable-public-api";
import {
  createUnstablePublicEvalsRoute,
  withUnstablePublicEvalsMiddlewares,
} from "@/src/features/public-api/server/unstable-public-evals-route";
import {
  GetUnstableEvaluatorsQuery,
  GetUnstableEvaluatorsResponse,
  PostUnstableEvaluatorBody,
  PostUnstableEvaluatorResponse,
} from "@/src/features/public-api/types/unstable-evaluators";

export default withUnstablePublicEvalsMiddlewares({
  GET: createUnstablePublicEvalsRoute({
    name: "List Unstable Evaluators",
    querySchema: GetUnstableEvaluatorsQuery,
    responseSchema: GetUnstableEvaluatorsResponse,
    fn: async ({ query, auth }) =>
      listPublicEvaluators({
        projectId: auth.scope.projectId,
        page: query.page,
        limit: query.limit,
      }),
  }),
  POST: createUnstablePublicEvalsRoute({
    name: "Create Unstable Evaluator",
    bodySchema: PostUnstableEvaluatorBody,
    responseSchema: PostUnstableEvaluatorResponse,
    fn: async ({ body, auth }) => {
      const evaluator = await createPublicEvaluator({
        projectId: auth.scope.projectId,
        input: body,
      });

      await auditLog({
        action: "create",
        resourceType: EVAL_TEMPLATE_AUDIT_LOG_RESOURCE_TYPE,
        resourceId: evaluator.id,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
        after: evaluator,
      });

      return evaluator;
    },
  }),
});
