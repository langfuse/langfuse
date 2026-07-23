import {
  deletePublicEvaluator,
  getPublicEvaluator,
} from "@/src/features/evals/server/unstable-public-api";
import {
  createUnstablePublicApiRoute,
  withUnstablePublicApiMiddlewares,
} from "@/src/features/public-api/server/unstable-public-api-route";
import {
  DeleteUnstableEvaluatorQuery,
  DeleteUnstableEvaluatorResponse,
  GetUnstableEvaluatorQuery,
  GetUnstableEvaluatorResponse,
} from "@/src/features/public-api/types/unstable-evaluators";

export default withUnstablePublicApiMiddlewares({
  GET: createUnstablePublicApiRoute({
    name: "Get Unstable Evaluator",
    querySchema: GetUnstableEvaluatorQuery,
    responseSchema: GetUnstableEvaluatorResponse,
    fn: async ({ query, auth }) =>
      getPublicEvaluator({
        projectId: auth.scope.projectId,
        evaluatorId: query.evaluatorId,
      }),
  }),
  DELETE: createUnstablePublicApiRoute({
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
