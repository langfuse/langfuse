import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { LlmConnectionService } from "@/src/features/llm-api-key/server/llmConnectionService";
import {
  DeleteLlmConnectionV1Query,
  DeleteLlmConnectionV1Response,
} from "@/src/features/public-api/types/llm-connections";

export default withMiddlewares({
  DELETE: createAuthedProjectAPIRoute({
    name: "Delete LLM Connection",
    action: "llmApiKeys:delete",
    querySchema: DeleteLlmConnectionV1Query,
    responseSchema: DeleteLlmConnectionV1Response,
    isAdminApiKeyAuthAllowed: true,
    fn: async ({ query, auth }) => {
      await new LlmConnectionService().delete({
        owner: {
          type: "project",
          projectId: auth.scope.projectId,
          organizationId: auth.scope.orgId,
        },
        id: query.id,
        actor: {
          projectId: auth.scope.projectId,
          orgId: auth.scope.orgId,
          apiKeyId: auth.scope.apiKeyId,
        },
      });

      return {
        message: "LLM connection successfully deleted" as const,
      };
    },
  }),
});
