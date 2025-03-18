import { logger } from "@langfuse/shared/src/server";
import { z } from "zod";

import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { updatePrompt } from "@/src/features/prompts/server/actions/updatePrompts";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { auditLog } from "@/src/features/audit-logs/auditLog";

const UpdatePromptBodySchema = z.object({
  newLabels: z
    .array(z.string())
    .refine((labels) => !labels.includes("latest"), {
      message: "Label 'latest' is always assigned to the latest prompt version",
    }),
});

export const promptVersionHandler = withMiddlewares({
  PATCH: createAuthedAPIRoute({
    name: "Update Prompt",
    bodySchema: UpdatePromptBodySchema,
    responseSchema: z.any(),
    fn: async ({ body, res, req, auth }) => {
      try {
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
        });

        logger.info(`Prompt updated ${JSON.stringify(prompt)}`);

        return res.status(200).json(prompt);
      } catch (e) {
        logger.error(e);
        if (e instanceof LangfuseNotFoundError) {
          return res.status(404).json({ message: e.message });
        }
        return res.status(500).json({ message: "Internal server error" });
      }
    },
  }),
});
