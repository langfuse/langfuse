import {
  createStablePublicApiRoute,
  withStablePublicApiMiddlewares,
} from "../stablePublicApiRoute";
import {
  deleteEvaluatorForPublicApi,
  getEvaluatorForPublicApi,
  updateEvaluatorForPublicApi,
} from "./evaluatorApiService";
import {
  DeleteEvaluatorResponse,
  Evaluator,
  EvaluatorIdQuery,
  UpdateEvaluatorBody,
} from "../../types/evaluation/evaluators";

export const evaluatorApiHandler = withStablePublicApiMiddlewares({
  GET: createStablePublicApiRoute({
    name: "Get evaluator",
    action: "evaluator:read",
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
    action: "evaluator:CUD",
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
    action: "evaluator:CUD",
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
