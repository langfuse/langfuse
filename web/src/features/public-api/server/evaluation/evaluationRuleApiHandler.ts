import {
  createStablePublicApiRoute,
  withStablePublicApiMiddlewares,
} from "@/src/features/public-api/server/stablePublicApiRoute";
import {
  deleteEvaluationRuleForPublicApi,
  getEvaluationRuleForPublicApi,
  updateEvaluationRuleForPublicApi,
} from "./evaluationRuleApiService";
import {
  DeleteEvaluationRuleResponse,
  EvaluationRule,
  EvaluationRuleIdQuery,
  UpdateEvaluationRuleBody,
} from "@/src/features/public-api/types/evaluation/evaluationRules";

export const evaluationRuleApiHandler = withStablePublicApiMiddlewares({
  GET: createStablePublicApiRoute({
    name: "Get evaluation rule",
    action: "evaluationRule:read",
    querySchema: EvaluationRuleIdQuery,
    responseSchema: EvaluationRule,
    fn: ({ query, auth }) =>
      getEvaluationRuleForPublicApi({
        projectId: auth.scope.projectId,
        evaluationRuleId: query.evaluationRuleId,
        auditScope: auth.scope,
      }),
  }),
  PATCH: createStablePublicApiRoute({
    name: "Update evaluation rule",
    action: "evaluationRule:CUD",
    querySchema: EvaluationRuleIdQuery,
    bodySchema: UpdateEvaluationRuleBody,
    responseSchema: EvaluationRule,
    fn: ({ query, body, auth }) =>
      updateEvaluationRuleForPublicApi({
        projectId: auth.scope.projectId,
        evaluationRuleId: query.evaluationRuleId,
        input: body,
        auditScope: auth.scope,
      }),
  }),
  DELETE: createStablePublicApiRoute({
    name: "Delete evaluation rule",
    action: "evaluationRule:CUD",
    querySchema: EvaluationRuleIdQuery,
    responseSchema: DeleteEvaluationRuleResponse,
    fn: ({ query, auth }) =>
      deleteEvaluationRuleForPublicApi({
        projectId: auth.scope.projectId,
        evaluationRuleId: query.evaluationRuleId,
        auditScope: auth.scope,
      }),
  }),
});
