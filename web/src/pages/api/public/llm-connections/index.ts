import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { shadowAuthorize } from "@/src/features/public-api/server/shadowAuth";
import { LlmConnectionService } from "@/src/features/llm-api-key/server/llmConnectionService";
import {
  GetLlmConnectionsV1Query,
  GetLlmConnectionsV1Response,
  PutLlmConnectionV1Body,
  PutLlmConnectionV1Response,
  transformDbLlmConnectionToAPI,
} from "@/src/features/public-api/types/llm-connections";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get LLM Connections",
    action: "llmApiKeys:read",
    querySchema: GetLlmConnectionsV1Query,
    responseSchema: GetLlmConnectionsV1Response,
    isAdminApiKeyAuthAllowed: true,
    fn: async ({ query, auth }) => {
      const result = await new LlmConnectionService().list({
        owner: {
          type: "project",
          projectId: auth.scope.projectId,
          organizationId: auth.scope.orgId,
        },
        page: query.page,
        limit: query.limit,
      });

      return {
        data: result.data.map(transformDbLlmConnectionToAPI),
        meta: {
          page: query.page,
          limit: query.limit,
          totalItems: result.totalCount,
          totalPages: Math.ceil(result.totalCount / query.limit),
        },
      };
    },
  }),

  PUT: createAuthedProjectAPIRoute({
    name: "Upsert LLM Connection",
    action: "llmApiKeys:create",
    bodySchema: PutLlmConnectionV1Body,
    responseSchema: PutLlmConnectionV1Response,
    isAdminApiKeyAuthAllowed: true,
    fn: async ({ body, auth, ctx, res }) => {
      const service = new LlmConnectionService();
      const owner = {
        type: "project" as const,
        projectId: auth.scope.projectId,
        organizationId: auth.scope.orgId,
      };
      if (await service.exists({ owner, provider: body.provider })) {
        const decision = shadowAuthorize({
          ctx,
          action: "llmApiKeys:update",
          resource: { projectId: auth.scope.projectId },
          legacyDecision: { success: true, scope: auth.scope },
        });
        if (!decision.success) throw decision.error;
      }

      const result = await service.upsert({
        owner,
        input: body,
        actor: {
          projectId: auth.scope.projectId,
          orgId: auth.scope.orgId,
          apiKeyId: auth.scope.apiKeyId,
        },
      });

      res.status(result.created ? 201 : 200);
      return transformDbLlmConnectionToAPI(result.connection);
    },
  }),
});
