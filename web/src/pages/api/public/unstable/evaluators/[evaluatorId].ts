import {
  deletePublicEvaluator,
  getPublicEvaluator,
} from "@/src/features/evals/server/unstable-public-api";
import {
  createUnstablePublicEvalsRoute,
  withUnstablePublicEvalsMiddlewares,
} from "@/src/features/public-api/server/unstable-public-evals-route";
import {
  DeleteUnstableEvaluatorQuery,
  DeleteUnstableEvaluatorResponse,
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
  DELETE: createUnstablePublicEvalsRoute({
    name: "Delete Unstable Evaluator",
    querySchema: DeleteUnstableEvaluatorQuery,
    responseSchema: DeleteUnstableEvaluatorResponse,
    fn: async ({ query, auth }) => {
      await deletePublicEvaluator({
        projectId: auth.scope.projectId,
        evaluatorId: query.evaluatorId,
        auditScope: auth.scope,
      });

      return {
        message: "Evaluator successfully deleted" as const,
      };
    },
  }),
});
