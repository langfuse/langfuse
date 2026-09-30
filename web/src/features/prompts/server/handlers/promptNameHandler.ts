import { z } from "zod";

import {
  deletePromptForApi,
  getPromptForApi,
} from "@/src/features/prompts/server/prompt-api-service";
import {
  withMiddlewares,
  createAuthedProjectAPIRoute,
} from "@/src/features/public-api/server";
import {
  GetPromptByNameSchema,
  LangfuseNotFoundError,
  PRODUCTION_LABEL,
} from "@langfuse/shared";

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
    fn: async ({ query, auth, ctx }) => {
      const { promptName, version, label } = query;

      await deletePromptForApi({
        context: auth.scope,
        promptName,
        version,
        label,
        ctx,
      });
    },
  }),
});
