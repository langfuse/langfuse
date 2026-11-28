import { z } from "zod";

import { listPromptsWithCursorForApi } from "@/src/features/prompts/server/prompt-api-service";
import { EncodedPromptsCursorV3 } from "@/src/features/prompts/server/actions/getPromptsMeta";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { GetPromptsMetaSchema } from "@langfuse/shared";

const GetPromptsV3Query = GetPromptsMetaSchema.omit({ page: true }).extend({
  cursor: EncodedPromptsCursorV3.optional(),
});

export const promptsV3Handler = withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Prompts V3",
    action: "prompts:read",
    querySchema: GetPromptsV3Query,
    responseSchema: z.any(),
    allowInAppAgentKey: true,
    isAdminApiKeyAuthAllowed: false,
    rateLimitResource: "prompts",
    fn: async ({ query, auth }) => {
      return await listPromptsWithCursorForApi({
        ...query,
        projectId: auth.scope.projectId,
      });
    },
  }),
});
