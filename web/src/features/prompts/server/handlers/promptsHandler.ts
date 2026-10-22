import { z } from "zod";

import {
  createPromptForApi,
  listPromptsForApi,
} from "@/src/features/prompts/server/prompt-api-service";
import {
  withMiddlewares,
  createAuthedProjectAPIRoute,
} from "@/src/features/public-api/server";
import { CreatePromptSchema, GetPromptsMetaSchema } from "@langfuse/shared";

export const promptsHandler = withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Prompts",
    action: "prompts:read",
    querySchema: GetPromptsMetaSchema,
    responseSchema: z.any(),
    allowInAppAgentKey: true,
    isAdminApiKeyAuthAllowed: false,
    rateLimitResource: "prompts",
    fn: async ({ query, auth }) => {
      return await listPromptsForApi({
        ...query,
        projectId: auth.scope.projectId,
      });
    },
  }),
  POST: createAuthedProjectAPIRoute({
    name: "Create Prompt",
    action: "prompts:CUD",
    bodySchema: CreatePromptSchema,
    responseSchema: z.any(),
    successStatusCode: 201,
    allowInAppAgentKey: true,
    isAdminApiKeyAuthAllowed: false,
    rateLimitResource: "prompts",
    fn: async ({ body, auth, ctx }) => {
      return await createPromptForApi({
        context: auth.scope,
        input: body,
        ctx,
      });
    },
  }),
});
