import {
  createStablePublicApiRoute,
  withStablePublicApiMiddlewares,
} from "@/src/features/public-api/server/stable-public-api-route";
import {
  createEvaluatorForPublicApi,
  listEvaluatorsForPublicApi,
} from "@/src/features/evals/server/public-api/evaluator-api-service";
import {
  CreateEvaluatorBody,
  Evaluator,
  ListEvaluatorsQuery,
  ListEvaluatorsResponse,
} from "@/src/features/public-api/types/evaluators";

export default withStablePublicApiMiddlewares({
  GET: createStablePublicApiRoute({
    name: "List evaluators",
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
