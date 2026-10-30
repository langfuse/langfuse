import {
  createStablePublicApiRoute,
  withStablePublicApiMiddlewares,
} from "@/src/features/public-api/server/stablePublicApiRoute";
import {
  createEvaluatorForPublicApi,
  listEvaluatorsForPublicApi,
} from "./evaluatorApiService";
import {
  CreateEvaluatorBody,
  Evaluator,
  ListEvaluatorsQuery,
  ListEvaluatorsResponse,
} from "@/src/features/public-api/types/evaluation/evaluators";

export const evaluatorsApiHandler = withStablePublicApiMiddlewares({
  GET: createStablePublicApiRoute({
    name: "List evaluators",
    action: "evaluator:read",
    querySchema: ListEvaluatorsQuery,
    responseSchema: ListEvaluatorsResponse,
    fn: ({ query, auth }) =>
      listEvaluatorsForPublicApi({
        projectId: auth.scope.projectId,
        limit: query.limit,
        cursor: query.cursor,
        auditScope: auth.scope,
      }),
  }),
  POST: createStablePublicApiRoute({
    name: "Create evaluator",
    action: "evaluator:CUD",
    bodySchema: CreateEvaluatorBody,
    responseSchema: Evaluator,
    successStatusCode: 201,
    fn: ({ body, auth }) =>
      createEvaluatorForPublicApi({
        projectId: auth.scope.projectId,
        input: body,
        auditScope: auth.scope,
      }),
  }),
});
