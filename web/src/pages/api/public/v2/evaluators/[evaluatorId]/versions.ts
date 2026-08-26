import {
  createStablePublicApiRoute,
  withStablePublicApiMiddlewares,
} from "@/src/features/public-api/server/stable-public-api-route";
import { listEvaluatorVersionsForPublicApi } from "@/src/features/evals/server/public-api/evaluator-api-service";
import {
  ListEvaluatorVersionsQuery,
  ListEvaluatorVersionsResponse,
} from "@/src/features/public-api/types/evaluators";

export default withStablePublicApiMiddlewares({
  GET: createStablePublicApiRoute({
    name: "List evaluator versions",
    querySchema: ListEvaluatorVersionsQuery,
    responseSchema: ListEvaluatorVersionsResponse,
    fn: ({ query, auth }) =>
      listEvaluatorVersionsForPublicApi({
        projectId: auth.scope.projectId,
        evaluatorId: query.evaluatorId,
        limit: query.limit,
        cursor: query.cursor,
        auditScope: auth.scope,
      }),
  }),
});
