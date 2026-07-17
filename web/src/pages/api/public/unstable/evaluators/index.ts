import {
  createPublicEvaluator,
  listPublicEvaluators,
} from "@/src/features/evals/server/unstable-public-api";
import {
  createUnstablePublicApiRoute,
  withUnstablePublicApiMiddlewares,
} from "@/src/features/public-api/server/unstable-public-api-route";
import {
  GetUnstableEvaluatorsQuery,
  GetUnstableEvaluatorsResponse,
  PostUnstableEvaluatorBody,
  PostUnstableEvaluatorResponse,
} from "@/src/features/public-api/types/unstable-evaluators";

export default withUnstablePublicApiMiddlewares({
  GET: createUnstablePublicApiRoute({
    name: "List Unstable Evaluators",
    querySchema: GetUnstableEvaluatorsQuery,
    responseSchema: GetUnstableEvaluatorsResponse,
    fn: async ({ query, auth }) =>
      listPublicEvaluators({
        projectId: auth.scope.projectId,
        page: query.page,
        limit: query.limit,
      }),
  }),
  POST: createUnstablePublicApiRoute({
    name: "Create Unstable Evaluator",
    bodySchema: PostUnstableEvaluatorBody,
    responseSchema: PostUnstableEvaluatorResponse,
    fn: async ({ body, auth }) =>
      createPublicEvaluator({
        projectId: auth.scope.projectId,
        input: body,
        auditScope: auth.scope,
      }),
  }),
});
