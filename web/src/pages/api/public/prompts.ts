import { z } from "zod";

import { createPrompt } from "@/src/features/prompts/server/actions/createPrompt";
import { getPromptByName } from "@/src/features/prompts/server/actions/getPromptByName";
import {
  createAuthedProjectAPIRoute,
  withMiddlewares,
} from "@/src/features/public-api/server";
import { telemetry } from "@/src/features/telemetry";
import { prisma } from "@langfuse/shared/src/db";
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
    fn: async ({ body, auth }) => {
      await telemetry();

      const prompt = await createPrompt({
        ...body,
        labels: body.isActive
          ? [...new Set([...body.labels, PRODUCTION_LABEL])]
          : body.labels,
        config: body.config ?? {},
        projectId: auth.scope.projectId,
        createdBy: "API",
        prisma: prisma,
      });

      return {
        ...prompt,
        isActive: prompt.labels.includes(PRODUCTION_LABEL),
      };
    },
  }),
});
