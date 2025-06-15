import { logger } from "@langfuse/shared/src/server";
import { z } from "zod/v4";

import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { updatePrompt } from "@/src/features/prompts/server/actions/updatePrompts";
import { auditLog } from "@/src/features/audit-logs/auditLog";

const UpdatePromptBodySchema = z.object({
  newLabels: z
    .array(z.string())
    .refine((labels) => !labels.includes("latest"), {
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

      const prompt = await updatePrompt({
        promptName: promptName as string,
        projectId: auth.scope.projectId,
        promptVersion: Number(promptVersion),
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
