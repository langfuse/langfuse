import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetLlmConnectionsV1Query,
  GetLlmConnectionsV1Response,
  transformDbLlmConnectionToAPI,
} from "@/src/features/public-api/types/llm-connections";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get LLM Connections",
    querySchema: GetLlmConnectionsV1Query,
    responseSchema: GetLlmConnectionsV1Response,
    fn: async ({ query, auth }) => {
      const { limit, page } = query;

      // Explicitly select only safe fields to prevent secret leakage
      const llmConnections = await prisma.llmApiKeys.findMany({
        select: {
          id: true,
          provider: true,
          adapter: true,
          displaySecretKey: true,
          baseURL: true,
          customModels: true,
          withDefaultModels: true,
          extraHeaderKeys: true,
          createdAt: true,
          updatedAt: true,
          // Explicitly exclude: secretKey, extraHeaders, config
        },
        where: {
          projectId: auth.scope.projectId,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: limit,
        skip: (page - 1) * limit,
      });

      const totalItems = await prisma.llmApiKeys.count({
        where: {
          projectId: auth.scope.projectId,
        },
      });

      // Transform and validate through strict schema
      const transformedConnections = llmConnections.map(
        transformDbLlmConnectionToAPI,
      );

      return {
        data: transformedConnections,
        meta: {
          page,
          limit,
          totalItems,
          totalPages: Math.ceil(totalItems / limit),
        },
      };
    },
  }),
});
