import { z } from "zod";
import { LATEST_PROMPT_LABEL } from "@langfuse/shared";

import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { updatePromptLabelsForApi } from "@/src/features/prompts/server/prompt-api-service";

const UpdatePromptBodySchema = z.object({
  newLabels: z
    .array(z.string())
    .refine((labels) => !labels.includes(LATEST_PROMPT_LABEL), {
      message: "Label 'latest' is always assigned to the latest prompt version",
    }),
});

export const promptVersionHandler = withMiddlewares({
  PATCH: createAuthedProjectAPIRoute({
    name: "Update Prompt",
    bodySchema: UpdatePromptBodySchema,
    responseSchema: z.any(),
    fn: async ({ body, req, auth }) => {
      const { newLabels } = UpdatePromptBodySchema.parse(body);
      const { promptName, promptVersion } = req.query;

      const { updatedPrompt } = await updatePromptLabelsForApi({
        context: auth.scope,
        promptName: promptName as string,
        promptVersion: Number(promptVersion),
        newLabels,
      });

      return updatedPrompt;
    },
  }),
});
