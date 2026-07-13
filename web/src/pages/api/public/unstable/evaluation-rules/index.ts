import {
  createPublicEvaluationRule,
  listPublicEvaluationRules,
} from "@/src/features/evals/server/unstable-public-api";
import {
  createUnstablePublicApiRoute,
  withUnstablePublicApiMiddlewares,
} from "@/src/features/public-api/server/unstable-public-api-route";
import {
  GetUnstableEvaluationRulesQuery,
  GetUnstableEvaluationRulesResponse,
  PostUnstableEvaluationRuleBody,
  PostUnstableEvaluationRuleResponse,
} from "@/src/features/public-api/types/unstable-evaluation-rules";

export default withUnstablePublicApiMiddlewares({
  GET: createUnstablePublicApiRoute({
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
  POST: createUnstablePublicApiRoute({
    name: "Create Unstable Evaluation Rule",
    bodySchema: PostUnstableEvaluationRuleBody,
    responseSchema: PostUnstableEvaluationRuleResponse,
    fn: async ({ body, auth }) =>
      createPublicEvaluationRule({
        orgId: auth.scope.orgId,
        projectId: auth.scope.projectId,
        input: body,
        auditScope: auth.scope,
      }),
  }),
});
