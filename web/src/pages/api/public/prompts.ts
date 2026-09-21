import { z } from "zod";

import { getPromptByName } from "@/src/features/prompts/server/actions/getPromptByName";
import { createPromptForApi } from "@/src/features/prompts/server/prompt-api-service";
import {
  createAuthedProjectAPIRoute,
  withMiddlewares,
} from "@/src/features/public-api/server";
import { telemetry } from "@/src/features/telemetry";
import {
  GetPromptSchema,
  LangfuseNotFoundError,
  LegacyCreatePromptSchema,
  PRODUCTION_LABEL,
} from "@langfuse/shared";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Prompt (Legacy)",
    action: "prompts:read",
    querySchema: GetPromptSchema,
    responseSchema: z.any(),
    allowInAppAgentKey: false,
    isAdminApiKeyAuthAllowed: false,
    rateLimitResource: "prompts",
    fn: async ({ query, auth }) => {
      await telemetry();

      const prompt = await getPromptByName({
        promptName: query.name,
        projectId: auth.scope.projectId,
        version: query.version ?? undefined,
      });

      if (!prompt) throw new LangfuseNotFoundError("Prompt not found");

      return {
        ...prompt,
        isActive: prompt.labels.includes(PRODUCTION_LABEL),
      };
    },
  }),
  POST: createAuthedProjectAPIRoute({
    name: "Create Prompt (Legacy)",
    action: "prompts:CUD",
    bodySchema: LegacyCreatePromptSchema,
    responseSchema: z.any(),
    successStatusCode: 201,
    allowInAppAgentKey: false,
    isAdminApiKeyAuthAllowed: false,
    rateLimitResource: "prompts",
    fn: async ({ body, auth, ctx }) => {
      await telemetry();

      const { isActive, ...input } = body;
      const prompt = await createPromptForApi({
        context: auth.scope,
        input: {
          ...input,
          labels: isActive
            ? [...new Set([...input.labels, PRODUCTION_LABEL])]
            : input.labels,
        },
        ctx,
      });

      return {
        ...prompt,
        isActive: prompt.labels.includes(PRODUCTION_LABEL),
      };
    },
  }),
});
