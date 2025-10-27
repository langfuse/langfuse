import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetLlmConnectionsV1Query,
  GetLlmConnectionsV1Response,
  PutLlmConnectionV1Body,
  PutLlmConnectionV1Response,
  transformDbLlmConnectionToAPI,
} from "@/src/features/public-api/types/llm-connections";
import { encrypt } from "@langfuse/shared/encryption";
import { getDisplaySecretKey } from "@/src/features/llm-api-key/server/router";
import { auditLog } from "@/src/features/audit-logs/auditLog";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get LLM Connections",
    querySchema: GetLlmConnectionsV1Query,
    responseSchema: GetLlmConnectionsV1Response,
    isAdminApiKeyAuthAllowed: true,
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

  PUT: createAuthedProjectAPIRoute({
    name: "Upsert LLM Connection",
    bodySchema: PutLlmConnectionV1Body,
    responseSchema: PutLlmConnectionV1Response,
    isAdminApiKeyAuthAllowed: true,
    fn: async ({ body, auth, res }) => {
      const projectId = auth.scope.projectId;

      const existingConnection = await prisma.llmApiKeys.findUnique({
        where: {
          projectId_provider: {
            projectId,
            provider: body.provider,
          },
        },
        select: { id: true },
      });

      const isUpdate = Boolean(existingConnection);

      const llmConnectionBody = {
        adapter: body.adapter,
        secretKey: encrypt(body.secretKey),
        displaySecretKey: getDisplaySecretKey(body.secretKey),
        baseURL: body.baseURL || null,
        customModels: body.customModels || [],
        withDefaultModels: body.withDefaultModels,
        extraHeaders: body.extraHeaders
          ? encrypt(JSON.stringify(body.extraHeaders))
          : null,
        extraHeaderKeys: body.extraHeaders
          ? Object.keys(body.extraHeaders)
          : [],
      };

      // Perform upsert
      const connection = await prisma.llmApiKeys.upsert({
        where: {
          projectId_provider: {
            projectId,
            provider: body.provider,
          },
        },
        create: {
          projectId,
          provider: body.provider,
          ...llmConnectionBody,
        },
        update: llmConnectionBody,
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
      });

      // Set appropriate status code
      res.status(isUpdate ? 200 : 201);

      // Add audit log entry
      await auditLog({
        action: isUpdate ? "update" : "create",
        resourceType: "llmApiKey",
        resourceId: connection.id,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
      });

      // Transform and validate through strict schema
      return transformDbLlmConnectionToAPI(connection);
    },
  }),
});
