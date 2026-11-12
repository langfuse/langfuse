import { z } from "zod";
import { LATEST_PROMPT_LABEL } from "@langfuse/shared";

import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { updatePromptLabelsForApi } from "@/src/features/prompts/server/prompt-api-service";

const latestLabelMessage =
  "Label 'latest' is always assigned to the latest prompt version";

const LabelListSchema = z
  .array(z.string())
  .nullish()
  .transform((labels) => labels ?? [])
  .refine((labels) => !labels.includes(LATEST_PROMPT_LABEL), {
    message: latestLabelMessage,
  });

const UpdatePromptBodySchema = z
  .object({
    newLabels: LabelListSchema,
    removeLabels: LabelListSchema,
  })
  .refine(
    ({ newLabels, removeLabels }) =>
      !newLabels.some((label) => removeLabels.includes(label)),
    {
      message: "A label cannot be in both newLabels and removeLabels",
      path: ["removeLabels"],
    },
  );

const UpdatePromptQuerySchema = z.object({
  promptName: z.string(),
  promptVersion: z.coerce.number().int().positive(),
});

export const promptVersionHandler = withMiddlewares({
  PATCH: createAuthedProjectAPIRoute({
    name: "Update Prompt",
    action: "prompts:CUD",
    querySchema: UpdatePromptQuerySchema,
    bodySchema: UpdatePromptBodySchema,
    responseSchema: z.any(),
    allowInAppAgentKey: true,
    isAdminApiKeyAuthAllowed: false,
    rateLimitResource: "prompts",
    fn: async ({ body, query, auth, ctx }) => {
      const { newLabels, removeLabels } = body;
      const { promptName, promptVersion } = query;

      const { updatedPrompt } = await updatePromptLabelsForApi({
        context: auth.scope,
        promptName,
        promptVersion,
        newLabels,
        removeLabels,
        ctx,
      });

      return updatedPrompt;
    },
  }),
});
