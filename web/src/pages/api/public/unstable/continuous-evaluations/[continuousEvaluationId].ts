import { auditLog } from "@/src/features/audit-logs/auditLog";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  deletePublicContinuousEvaluation,
  getPublicContinuousEvaluation,
  updatePublicContinuousEvaluation,
} from "@/src/features/evals/server/public-evals-service";
import {
  DeleteUnstableContinuousEvaluationQuery,
  DeleteUnstableContinuousEvaluationResponse,
  GetUnstableContinuousEvaluationQuery,
  GetUnstableContinuousEvaluationResponse,
  PatchUnstableContinuousEvaluationBody,
  PatchUnstableContinuousEvaluationQuery,
  PatchUnstableContinuousEvaluationResponse,
} from "@/src/features/public-api/types/unstable-continuous-evaluations";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Unstable Continuous Evaluation",
    querySchema: GetUnstableContinuousEvaluationQuery,
    responseSchema: GetUnstableContinuousEvaluationResponse,
    fn: async ({ query, auth }) =>
      getPublicContinuousEvaluation({
        projectId: auth.scope.projectId,
        continuousEvaluationId: query.continuousEvaluationId,
      }),
  }),
  PATCH: createAuthedProjectAPIRoute({
    name: "Update Unstable Continuous Evaluation",
    querySchema: PatchUnstableContinuousEvaluationQuery,
    bodySchema: PatchUnstableContinuousEvaluationBody,
    responseSchema: PatchUnstableContinuousEvaluationResponse,
    fn: async ({ query, body, auth }) => {
      const before = await getPublicContinuousEvaluation({
        projectId: auth.scope.projectId,
        continuousEvaluationId: query.continuousEvaluationId,
      });

      const continuousEvaluation = await updatePublicContinuousEvaluation({
        projectId: auth.scope.projectId,
        continuousEvaluationId: query.continuousEvaluationId,
        input: body,
      });

      await auditLog({
        action: "update",
        resourceType: "job",
        resourceId: continuousEvaluation.id,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
        before,
        after: continuousEvaluation,
      });

      return continuousEvaluation;
    },
  }),
  DELETE: createAuthedProjectAPIRoute({
    name: "Delete Unstable Continuous Evaluation",
    querySchema: DeleteUnstableContinuousEvaluationQuery,
    responseSchema: DeleteUnstableContinuousEvaluationResponse,
    fn: async ({ query, auth }) => {
      const before = await getPublicContinuousEvaluation({
        projectId: auth.scope.projectId,
        continuousEvaluationId: query.continuousEvaluationId,
      });

      await deletePublicContinuousEvaluation({
        projectId: auth.scope.projectId,
        continuousEvaluationId: query.continuousEvaluationId,
      });

      await auditLog({
        action: "delete",
        resourceType: "job",
        resourceId: query.continuousEvaluationId,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
        before,
      });

      return {
        message: "Continuous evaluation successfully deleted" as const,
      };
    },
  }),
});
