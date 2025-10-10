import { logger } from "@langfuse/shared/src/server";
import { z } from "zod/v4";

import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { updatePrompt } from "@/src/features/prompts/server/actions/updatePrompts";
import { deletePromptVersion } from "@/src/features/prompts/server/actions/deletePromptVersion";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { prisma } from "@langfuse/shared/src/db";
import { LangfuseNotFoundError } from "@langfuse/shared";
import {
  PatchPromptVersionV2Query,
  PatchPromptVersionV2Body,
  DeletePromptVersionV2Query,
  DeletePromptVersionV2Response,
} from "@/src/features/public-api/types/prompts";

// kept in types/prompts

export const promptVersionHandler = withMiddlewares({
  PATCH: createAuthedProjectAPIRoute({
    name: "Update Prompt",
    querySchema: PatchPromptVersionV2Query,
    bodySchema: PatchPromptVersionV2Body,
    responseSchema: z.any(),
    fn: async ({ body, query, auth }) => {
      const { newLabels } = body;
      const { promptName, promptVersion } = query;

      const prompt = await updatePrompt({
        promptName: promptName,
        projectId: auth.scope.projectId,
        promptVersion: promptVersion,
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
    querySchema: DeletePromptVersionV2Query,
    responseSchema: DeletePromptVersionV2Response,
    fn: async ({ query, auth }) => {
      const { promptName, promptVersion } = query;

      // Look up id by name+version for the public endpoint
      const toDelete = await prisma.prompt.findFirst({
        where: {
          projectId: auth.scope.projectId,
          name: promptName,
          version: promptVersion,
        },
      });

      if (!toDelete) {
        throw new LangfuseNotFoundError("Prompt not found");
      }

      await deletePromptVersion({
        projectId: auth.scope.projectId,
        promptVersionId: toDelete.id,
        onBeforeDelete: async (prompt) => {
          await auditLog({
            apiKeyId: auth.scope.apiKeyId,
            orgId: auth.scope.orgId,
            projectId: auth.scope.projectId,
            resourceType: "prompt",
            resourceId: prompt.id,
            action: "delete",
            before: prompt,
          });
        },
      });

      return { message: "Prompt version deleted successfully" };
    },
  }),
});
