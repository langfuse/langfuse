import {
  createStablePublicApiRoute,
  withStablePublicApiMiddlewares,
} from "@/src/features/public-api/server/stablePublicApiRoute";
import {
  createEvaluationRuleForPublicApi,
  listEvaluationRulesForPublicApi,
} from "./evaluationRuleApiService";
import {
  CreateEvaluationRuleBody,
  EvaluationRule,
  ListEvaluationRulesQuery,
  ListEvaluationRulesResponse,
} from "@/src/features/public-api/types/evaluation/evaluationRules";

export const evaluationRulesApiHandler = withStablePublicApiMiddlewares({
  GET: createStablePublicApiRoute({
    name: "List evaluation rules",
    action: "evaluationRule:read",
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
    action: "evaluationRule:CUD",
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
