import {
  createStablePublicApiRoute,
  withStablePublicApiMiddlewares,
} from "@/src/features/public-api/server/stable-public-api-route";
import {
  createEvaluationRuleForPublicApi,
  listEvaluationRulesForPublicApi,
} from "@/src/features/evals/server/public-api/evaluation-rule-api-service";
import {
  CreateEvaluationRuleBody,
  EvaluationRule,
  ListEvaluationRulesQuery,
  ListEvaluationRulesResponse,
} from "@/src/features/public-api/types/evaluation-rules";

export default withStablePublicApiMiddlewares({
  GET: createStablePublicApiRoute({
    name: "List evaluation rules",
    querySchema: ListEvaluationRulesQuery,
    responseSchema: ListEvaluationRulesResponse,
    fn: ({ query, auth }) =>
      listEvaluationRulesForPublicApi({
        projectId: auth.scope.projectId,
        limit: query.limit,
        cursor: query.cursor,
        auditScope: auth.scope,
      }),
  }),
  POST: createStablePublicApiRoute({
    name: "Create evaluation rule",
    bodySchema: CreateEvaluationRuleBody,
    responseSchema: EvaluationRule,
    successStatusCode: 201,
    fn: ({ body, auth }) =>
      createEvaluationRuleForPublicApi({
        projectId: auth.scope.projectId,
        input: body,
        auditScope: auth.scope,
      }),
  }),
});
