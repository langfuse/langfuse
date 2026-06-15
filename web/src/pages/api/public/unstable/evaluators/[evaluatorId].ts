import { getPublicEvaluator } from "@/src/features/evals/server/unstable-public-api";
import {
  createUnstablePublicEvalsRoute,
  withUnstablePublicEvalsMiddlewares,
} from "@/src/features/public-api/server/unstable-public-evals-route";
import {
  GetUnstableEvaluatorQuery,
  GetUnstableEvaluatorResponse,
} from "@/src/features/public-api/types/unstable-evaluators";

export default withUnstablePublicEvalsMiddlewares({
  GET: createUnstablePublicEvalsRoute({
    name: "Get Unstable Evaluator",
    querySchema: GetUnstableEvaluatorQuery,
    responseSchema: GetUnstableEvaluatorResponse,
    fn: async ({ query, auth }) =>
      getPublicEvaluator({
        projectId: auth.scope.projectId,
        evaluatorId: query.evaluatorId,
      }),
  }),
});
