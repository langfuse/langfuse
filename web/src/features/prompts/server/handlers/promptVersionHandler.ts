import { logger } from "@langfuse/shared/src/server";
import { z } from "zod";
import { LATEST_PROMPT_LABEL } from "@langfuse/shared";

import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { updatePrompt } from "@/src/features/prompts/server/actions/updatePrompts";
import { auditLog } from "@/src/features/audit-logs/auditLog";

const UpdatePromptBodySchema = z.object({
  newLabels: z
    .array(z.string())
    .refine((labels) => !labels.includes(LATEST_PROMPT_LABEL), {
      message: "Label 'latest' is always assigned to the latest prompt version",
    }),
});

const PromptVersionQuerySchema = z.object({
  promptName: z
    .union([z.string(), z.array(z.string())])
    .transform((value) => (Array.isArray(value) ? value.join("/") : value)),
  promptVersion: z.coerce.number().int(),
});

export const promptVersionHandler = withMiddlewares({
  PATCH: createAuthedProjectAPIRoute({
    name: "Update Prompt",
    querySchema: PromptVersionQuerySchema,
    bodySchema: UpdatePromptBodySchema,
    responseSchema: z.any(),
    fn: async ({ body, query, auth }) => {
      const { newLabels } = UpdatePromptBodySchema.parse(body);
      const { promptName, promptVersion } = query;

      const prompt = await updatePrompt({
        promptName,
        projectId: auth.scope.projectId,
        promptVersion,
        newLabels,
      });

      await auditLog({
        action: "update",
        resourceType: "prompt",
        resourceId: prompt.id,
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
        after: prompt,
      });

      logger.info(`Prompt updated ${JSON.stringify(prompt)}`);

      return prompt;
    },
  }),
});
