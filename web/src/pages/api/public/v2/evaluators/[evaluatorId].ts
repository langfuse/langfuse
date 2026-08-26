import {
  createStablePublicApiRoute,
  withStablePublicApiMiddlewares,
} from "@/src/features/public-api/server/stable-public-api-route";
import {
  deleteEvaluatorForPublicApi,
  getEvaluatorForPublicApi,
  updateEvaluatorForPublicApi,
} from "@/src/features/evals/server/public-api/evaluator-api-service";
import {
  DeleteEvaluatorResponse,
  Evaluator,
  EvaluatorIdQuery,
  UpdateEvaluatorBody,
} from "@/src/features/public-api/types/evaluators";

export default withStablePublicApiMiddlewares({
  GET: createStablePublicApiRoute({
    name: "Get evaluator",
    querySchema: EvaluatorIdQuery,
    responseSchema: Evaluator,
    fn: ({ query, auth }) =>
      getEvaluatorForPublicApi({
        projectId: auth.scope.projectId,
        evaluatorId: query.evaluatorId,
        auditScope: auth.scope,
      }),
  }),
  PATCH: createStablePublicApiRoute({
    name: "Update evaluator",
    querySchema: EvaluatorIdQuery,
    bodySchema: UpdateEvaluatorBody,
    responseSchema: Evaluator,
    fn: ({ query, body, auth }) =>
      updateEvaluatorForPublicApi({
        projectId: auth.scope.projectId,
        evaluatorId: query.evaluatorId,
        input: body,
        auditScope: auth.scope,
      }),
  }),
  DELETE: createStablePublicApiRoute({
    name: "Delete evaluator",
    querySchema: EvaluatorIdQuery,
    responseSchema: DeleteEvaluatorResponse,
    fn: ({ query, auth }) =>
      deleteEvaluatorForPublicApi({
        projectId: auth.scope.projectId,
        evaluatorId: query.evaluatorId,
        auditScope: auth.scope,
      }),
  }),
});
