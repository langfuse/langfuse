import {
  createStablePublicApiRoute,
  withStablePublicApiMiddlewares,
} from "@/src/public-api/server/stablePublicApiRoute";
import { listEvaluatorVersionsForPublicApi } from "./evaluatorApiService";
import {
  ListEvaluatorVersionsQuery,
  ListEvaluatorVersionsResponse,
} from "@/src/public-api/types/evaluation/evaluators";

export const evaluatorVersionsApiHandler = withStablePublicApiMiddlewares({
  GET: createStablePublicApiRoute({
    name: "List evaluator versions",
    action: "evaluator:read",
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
