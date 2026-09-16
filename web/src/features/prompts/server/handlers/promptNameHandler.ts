import { z } from "zod";

import { getPromptForApi } from "@/src/features/prompts/server/prompt-api-service";
import { deletePrompt } from "@/src/features/prompts/server/actions/deletePrompt";
import {
  withMiddlewares,
  createAuthedProjectAPIRoute,
} from "@/src/features/public-api/server";
import {
  GetPromptByNameSchema,
  LangfuseNotFoundError,
  PRODUCTION_LABEL,
} from "@langfuse/shared";
import { auditLog } from "@/src/features/audit-logs/server";
import { prisma } from "@langfuse/shared/src/db";

export const promptNameHandler = withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Prompt",
    action: "prompts:read",
    querySchema: GetPromptByNameSchema,
    responseSchema: z.any(),
    allowInAppAgentKey: true,
    isAdminApiKeyAuthAllowed: false,
    rateLimitResource: "prompts",
    fn: async ({ query, auth }) => {
      const { promptName, version, label, resolve } = query;

      const prompt = await getPromptForApi({
        promptName,
        projectId: auth.scope.projectId,
        version,
        label,
        resolve,
      });

      if (!prompt) {
        let errorMessage = `Prompt not found: '${promptName}'`;

        if (version) {
          errorMessage += ` with version ${version}`;
        } else {
          errorMessage += ` with label '${label ?? PRODUCTION_LABEL}'`;
        }

        throw new LangfuseNotFoundError(errorMessage);
      }

      return {
        ...prompt,
        isActive: prompt.labels.includes(PRODUCTION_LABEL),
      };
    },
  }),
  DELETE: createAuthedProjectAPIRoute({
    name: "Delete Prompt",
    action: "prompts:CUD",
    querySchema: GetPromptByNameSchema,
    responseSchema: z.void(),
    successStatusCode: 204,
    allowInAppAgentKey: true,
    isAdminApiKeyAuthAllowed: false,
    rateLimitResource: "prompts",
    fn: async ({ query, auth }) => {
      const { promptName, version, label } = query;

      const where = {
        projectId: auth.scope.projectId,
        name: promptName,
        ...(version ? { version } : {}),
        ...(label ? { labels: { has: label } } : {}),
      };

      const prompts = await prisma.prompt.findMany({ where });

      for (const prompt of prompts) {
        await auditLog({
          action: "delete",
          resourceType: "prompt",
          resourceId: prompt.id,
          projectId: auth.scope.projectId,
          orgId: auth.scope.orgId,
          apiKeyId: auth.scope.apiKeyId,
          before: prompt,
        });
      }

      await deletePrompt({
        promptName,
        projectId: auth.scope.projectId,
        version,
        label,
        promptVersions: prompts,
      });
    },
  }),
});
