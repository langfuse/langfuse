import { logger } from "@langfuse/shared/src/server";
import { z } from "zod/v4";
import { Prisma, LATEST_PROMPT_LABEL } from "@langfuse/shared";
import { PromptService, redis } from "@langfuse/shared/src/server";
import { ForbiddenError, LangfuseConflictError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";

import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { updatePrompt } from "@/src/features/prompts/server/actions/updatePrompts";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { checkHasProtectedLabels } from "@/src/features/prompts/server/utils/checkHasProtectedLabels";
import { promptChangeEventSourcing } from "@/src/features/prompts/server/promptChangeEventSourcing";

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

      // Find the prompt version to delete
      const promptVersionToDelete = await prisma.prompt.findFirstOrThrow({
        where: {
          name: promptName as string,
          version,
          projectId,
        },
      });

      const { name, labels } = promptVersionToDelete;

      // Check if prompt has a protected label
      const { hasProtectedLabels, protectedLabels } = await checkHasProtectedLabels({
        prisma,
        projectId,
        labelsToCheck: promptVersionToDelete.labels,
      });

      if (hasProtectedLabels) {
        throw new ForbiddenError(
          `You don't have permission to delete a prompt with a protected label. Please contact your project admin for assistance.\n\n Protected labels are: ${protectedLabels.join(", ")}`,
        );
      }

      // Check for dependencies if the prompt has labels
      if (labels.length > 0) {
        const dependents = await prisma.$queryRaw<
          {
            parent_name: string;
            parent_version: number;
            child_version: number;
            child_label: string;
          }[]
        >`
          SELECT
            p."name" AS "parent_name",
            p."version" AS "parent_version",
            pd."child_version" AS "child_version",
            pd."child_label" AS "child_label"
          FROM
            prompt_dependencies pd
            INNER JOIN prompts p ON p.id = pd.parent_id
          WHERE
            p.project_id = ${projectId}
            AND pd.project_id = ${projectId}
            AND pd.child_name = ${name}
            AND (
              (pd."child_version" IS NOT NULL AND pd."child_version" = ${version})
              OR
              (pd."child_label" IS NOT NULL AND pd."child_label" IN (${Prisma.join(labels)}))
            )
          `;

        if (dependents.length > 0) {
          const dependencyMessages = dependents
            .map(
              (d) =>
                `${d.parent_name} v${d.parent_version} depends on ${name} ${d.child_version ? `v${d.child_version}` : d.child_label}`,
            )
            .join("\n");

          throw new LangfuseConflictError(
            `Other prompts are depending on the prompt version you are trying to delete:\n\n${dependencyMessages}\n\nPlease delete the dependent prompts first.`,
          );
        }
      }

      // Audit log before deletion
      await auditLog({
        action: "delete",
        resourceType: "prompt",
        resourceId: promptVersionToDelete.id,
        projectId,
        orgId: auth.scope.orgId,
        apiKeyId: auth.scope.apiKeyId,
        before: promptVersionToDelete,
      });

      const transaction = [
        prisma.prompt.delete({
          where: {
            id: promptVersionToDelete.id,
            projectId,
          },
        }),
      ];

      // If the deleted prompt was the latest version, update the latest prompt
      if (promptVersionToDelete.labels.includes(LATEST_PROMPT_LABEL)) {
        const newLatestPrompt = await prisma.prompt.findFirst({
          where: {
            projectId,
            name: name,
            id: { not: promptVersionToDelete.id },
          },
          orderBy: [{ version: "desc" }],
        });

        if (newLatestPrompt) {
          transaction.push(
            prisma.prompt.update({
              where: {
                id: newLatestPrompt.id,
                projectId,
              },
              data: {
                labels: {
                  push: LATEST_PROMPT_LABEL,
                },
              },
            }),
          );
        }
      }

      // Lock and invalidate cache for _all_ versions and labels of the prompt
      const promptService = new PromptService(prisma, redis);
      await promptService.lockCache({ projectId, promptName: name });
      await promptService.invalidateCache({ projectId, promptName: name });

      // Execute transaction
      await prisma.$transaction(transaction);

      // Unlock cache
      await promptService.unlockCache({ projectId, promptName: name });

      // Trigger webhooks for prompt version deletion
      await promptChangeEventSourcing(
        await promptService.resolvePrompt(promptVersionToDelete),
        "deleted",
      );

      logger.info(`Prompt version deleted ${JSON.stringify(promptVersionToDelete)}`);

      return promptVersionToDelete;
    },
  }),
});
