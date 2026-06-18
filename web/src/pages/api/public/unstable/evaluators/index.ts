import {
  createPublicEvaluator,
  listPublicEvaluators,
} from "@/src/features/evals/server/unstable-public-api";
import {
  createUnstablePublicEvalsRoute,
  withUnstablePublicEvalsMiddlewares,
} from "@/src/features/public-api/server/unstable-public-evals-route";
import {
  GetUnstableEvaluatorsQuery,
  GetUnstableEvaluatorsResponse,
  PostUnstableEvaluatorBody,
  PostUnstableEvaluatorResponse,
} from "@/src/features/public-api/types/unstable-evaluators";

export default withUnstablePublicEvalsMiddlewares({
  GET: createUnstablePublicEvalsRoute({
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
  POST: createUnstablePublicEvalsRoute({
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
