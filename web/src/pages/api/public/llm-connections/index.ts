import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetLlmConnectionsV1Query,
  GetLlmConnectionsV1Response,
  PostLlmConnectionV1Body,
  PostLlmConnectionV1Response,
  transformDbLlmConnectionToAPI,
} from "@/src/features/public-api/types/llm-connections";
import { encrypt } from "@langfuse/shared/encryption";
import { getDisplaySecretKey } from "@/src/features/llm-api-key/server/router";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { ForbiddenError } from "@langfuse/shared";

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

  POST: createAuthedProjectAPIRoute({
    name: "Create LLM Connection",
    bodySchema: PostLlmConnectionV1Body,
    responseSchema: PostLlmConnectionV1Response,
    successStatusCode: 201,
    fn: async ({ body, auth }) => {
      const projectId = auth.scope.projectId;

      // Check if a connection with this provider already exists
      const existingConnection = await prisma.llmApiKeys.findUnique({
        where: {
          projectId_provider: {
            projectId,
            provider: body.provider,
          },
        },
      });

      if (existingConnection) {
        throw new ForbiddenError(
          `LLM connection with provider '${body.provider}' already exists. Use PATCH /api/public/llm-connections/${body.provider} to update it.`,
        );
      }

      // Create the new LLM connection
      const newConnection = await prisma.llmApiKeys.create({
        data: {
          projectId,
          provider: body.provider,
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
        },
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

      // Add audit log entry
      await auditLog({
        action: "create",
        resourceType: "llmApiKey",
        resourceId: newConnection.id,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
      });

      // Transform and validate through strict schema
      return transformDbLlmConnectionToAPI(newConnection);
    },
  }),
});
