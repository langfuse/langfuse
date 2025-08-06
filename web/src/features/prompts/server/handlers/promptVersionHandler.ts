import { logger } from "@langfuse/shared/src/server";
import { z } from "zod/v4";
import { prisma } from "@langfuse/shared/src/db";

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
  DELETE: createAuthedProjectAPIRoute({
    name: "Delete Prompt Version",
    bodySchema: z.void(),
    responseSchema: z.any(),
    fn: async ({ req, auth }) => {
      const { promptName, promptVersion } = req.query;
      const projectId = auth.scope.projectId;
      const version = Number(promptVersion);

      const { validatePromptVersionDeletion } = await import("../utils/validatePromptVersionDeletion");
      const { executePromptVersionDeletion } = await import("../utils/executePromptVersionDeletion");

      // Validate the deletion (this will throw if not allowed)
      const validationResult = await validatePromptVersionDeletion({
        prisma,
        projectId,
        promptName: promptName as string,
        version,
        // No session provided, so it will use HTTP errors instead of TRPC errors
      });

      // Execute the deletion with all side effects
      await executePromptVersionDeletion({
        prisma,
        projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
        validationResult,
      });

      logger.info(`Prompt version deleted ${JSON.stringify(validationResult.promptVersionToDelete)}`);

      return validationResult.promptVersionToDelete;
    },
  }),
});
