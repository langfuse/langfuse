import { auditLog } from "@/src/features/audit-logs/auditLog";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  createPublicEvaluator,
  listPublicEvaluators,
} from "@/src/features/evals/server/public-evals-service";
import {
  GetUnstableEvaluatorsQuery,
  GetUnstableEvaluatorsResponse,
  PostUnstableEvaluatorBody,
  PostUnstableEvaluatorResponse,
} from "@/src/features/public-api/types/unstable-evaluators";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
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
  POST: createAuthedProjectAPIRoute({
    name: "Create Unstable Evaluator",
    bodySchema: PostUnstableEvaluatorBody,
    responseSchema: PostUnstableEvaluatorResponse,
    fn: async ({ body, auth }) => {
      const evaluator = await createPublicEvaluator({
        projectId: auth.scope.projectId,
        input: body,
      });

      await auditLog({
        action: "create",
        resourceType: "evalTemplate",
        resourceId: evaluator.id,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
        after: evaluator,
      });

      return evaluator;
    },
  }),
});
