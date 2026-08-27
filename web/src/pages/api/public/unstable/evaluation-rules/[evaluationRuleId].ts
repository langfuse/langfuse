import {
  deletePublicEvaluationRule,
  getPublicEvaluationRule,
  updatePublicEvaluationRule,
} from "@/src/features/evals/server/unstable-public-api";
import {
  createUnstablePublicApiRoute,
  withUnstablePublicApiMiddlewares,
} from "@/src/features/public-api/server/unstable-public-api-route";
import {
  DeleteUnstableEvaluationRuleQuery,
  DeleteUnstableEvaluationRuleResponse,
  GetUnstableEvaluationRuleQuery,
  GetUnstableEvaluationRuleResponse,
  PatchUnstableEvaluationRuleBody,
  PatchUnstableEvaluationRuleQuery,
  PatchUnstableEvaluationRuleResponse,
} from "@/src/features/public-api/types/unstable-evaluation-rules";

export default withUnstablePublicApiMiddlewares({
  GET: createUnstablePublicApiRoute({
    name: "Get Unstable Evaluation Rule",
    querySchema: GetUnstableEvaluationRuleQuery,
    responseSchema: GetUnstableEvaluationRuleResponse,
    fn: async ({ query, auth }) =>
      getPublicEvaluationRule({
        projectId: auth.scope.projectId,
        evaluationRuleId: query.evaluationRuleId,
      }),
  }),
  PATCH: createUnstablePublicApiRoute({
    name: "Update Unstable Evaluation Rule",
    querySchema: PatchUnstableEvaluationRuleQuery,
    bodySchema: PatchUnstableEvaluationRuleBody,
    responseSchema: PatchUnstableEvaluationRuleResponse,
    fn: async ({ query, body, auth }) =>
      updatePublicEvaluationRule({
        orgId: auth.scope.orgId,
        projectId: auth.scope.projectId,
        evaluationRuleId: query.evaluationRuleId,
        input: body,
        auditScope: auth.scope,
      }),
  }),
  DELETE: createUnstablePublicApiRoute({
    name: "Delete Unstable Evaluation Rule",
    querySchema: DeleteUnstableEvaluationRuleQuery,
    responseSchema: DeleteUnstableEvaluationRuleResponse,
    fn: async ({ query, auth }) => {
      await deletePublicEvaluationRule({
        projectId: auth.scope.projectId,
        evaluationRuleId: query.evaluationRuleId,
        auditScope: auth.scope,
      });

      return {
        message: "Evaluation rule successfully deleted" as const,
      };
    },
  }),
});
