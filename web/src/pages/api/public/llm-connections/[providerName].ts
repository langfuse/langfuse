import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  PatchLlmConnectionV1Body,
  PatchLlmConnectionV1Response,
  transformDbLlmConnectionToAPI,
} from "@/src/features/public-api/types/llm-connections";
import { z } from "zod/v4";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { encrypt } from "@langfuse/shared/encryption";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { getDisplaySecretKey } from "@/src/features/llm-api-key/server/router";

const ProviderNameSchema = z.object({
  providerName: z.string().min(1),
});

export default withMiddlewares({
  PATCH: createAuthedProjectAPIRoute({
    name: "Update LLM Connection",
    querySchema: ProviderNameSchema,
    bodySchema: PatchLlmConnectionV1Body,
    responseSchema: PatchLlmConnectionV1Response,
    fn: async ({ query, body, auth }) => {
      const { providerName } = query;
      const projectId = auth.scope.projectId;

      // Find the existing LLM connection by project ID and provider name
      const existingConnection = await prisma.llmApiKeys.findUnique({
        where: {
          projectId_provider: {
            projectId,
            provider: providerName,
          },
        },
      });

      if (!existingConnection) {
        throw new LangfuseNotFoundError(
          `LLM connection with provider '${providerName}' not found`,
        );
      }

      // Update the connection
      const updatedConnection = await prisma.llmApiKeys.update({
        where: {
          id: existingConnection.id,
        },
        data: {
          secretKey: body.secretKey ? encrypt(body.secretKey) : undefined,
          displaySecretKey: body.secretKey
            ? getDisplaySecretKey(body.secretKey)
            : undefined,
          extraHeaders: body.extraHeaders
            ? encrypt(JSON.stringify(body.extraHeaders))
            : undefined,
          extraHeaderKeys: body.extraHeaders
            ? Object.keys(body.extraHeaders)
            : undefined,

          baseURL: body.baseURL,
          customModels: body.customModels,
          withDefaultModels: body.withDefaultModels,
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
        action: "update",
        resourceType: "llmApiKey",
        resourceId: updatedConnection.id,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
      });

      // Transform and validate through strict schema
      return transformDbLlmConnectionToAPI(updatedConnection);
    },
  }),
});
