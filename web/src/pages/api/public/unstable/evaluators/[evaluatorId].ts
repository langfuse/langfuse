import { auditLog } from "@/src/features/audit-logs/auditLog";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  deletePublicEvaluator,
  getPublicEvaluator,
  updatePublicEvaluator,
} from "@/src/features/evals/server/public-evals-service";
import {
  DeleteUnstableEvaluatorQuery,
  DeleteUnstableEvaluatorResponse,
  GetUnstableEvaluatorQuery,
  GetUnstableEvaluatorResponse,
  PatchUnstableEvaluatorBody,
  PatchUnstableEvaluatorQuery,
  PatchUnstableEvaluatorResponse,
} from "@/src/features/public-api/types/unstable-evaluators";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Unstable Evaluator",
    querySchema: GetUnstableEvaluatorQuery,
    responseSchema: GetUnstableEvaluatorResponse,
    fn: async ({ query, auth }) =>
      getPublicEvaluator({
        projectId: auth.scope.projectId,
        evaluatorId: query.evaluatorId,
      }),
  }),
  PATCH: createAuthedProjectAPIRoute({
    name: "Update Unstable Evaluator",
    querySchema: PatchUnstableEvaluatorQuery,
    bodySchema: PatchUnstableEvaluatorBody,
    responseSchema: PatchUnstableEvaluatorResponse,
    fn: async ({ query, body, auth }) => {
      const before = await getPublicEvaluator({
        projectId: auth.scope.projectId,
        evaluatorId: query.evaluatorId,
      });

      const evaluator = await updatePublicEvaluator({
        projectId: auth.scope.projectId,
        evaluatorId: query.evaluatorId,
        input: body,
      });

      await auditLog({
        action: "update",
        resourceType: "evalTemplate",
        resourceId: evaluator.id,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
        before,
        after: evaluator,
      });

      return evaluator;
    },
  }),
  DELETE: createAuthedProjectAPIRoute({
    name: "Delete Unstable Evaluator",
    querySchema: DeleteUnstableEvaluatorQuery,
    responseSchema: DeleteUnstableEvaluatorResponse,
    fn: async ({ query, auth }) => {
      const before = await getPublicEvaluator({
        projectId: auth.scope.projectId,
        evaluatorId: query.evaluatorId,
      });

      await deletePublicEvaluator({
        projectId: auth.scope.projectId,
        evaluatorId: query.evaluatorId,
      });

      await auditLog({
        action: "delete",
        resourceType: "evalTemplate",
        resourceId: query.evaluatorId,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
        before,
      });

      return {
        message: "Evaluator successfully deleted" as const,
      };
    },
  }),
});
