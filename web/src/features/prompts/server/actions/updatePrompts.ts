import { logger, PromptService } from "@langfuse/shared/src/server";
import { removeLabelsFromPreviousPromptVersions } from "@/src/features/prompts/server/utils/updatePromptLabels";
import { InvalidRequestError, LangfuseNotFoundError } from "@langfuse/shared";
import { prisma, Prisma } from "@langfuse/shared/src/db";
import { redis } from "@langfuse/shared/src/server";

export type UpdatePromptParams = {
  promptName: string;
  projectId: string;
  promptVersion: number;
  newLabels: string[];
};

export const updatePrompt = async (params: UpdatePromptParams) => {
  const { promptName, projectId, promptVersion, newLabels } = params;

  logger.info(
    `Updating prompt ${promptName} in project ${projectId} version ${promptVersion} with labels ${newLabels}`,
  );
  const promptService = new PromptService(prisma, redis);
  try {
    await promptService.lockCache({ projectId, promptName: promptName });

    const result = prisma.$transaction(async (tx) => {
      const prompt = (
        await tx.$queryRaw<
          Array<{
            id: string;
            name: string;
            version: number;
            labels: string[];
          }>
        >`
        SELECT
          *
        FROM
          prompts
        WHERE
          project_id = ${projectId}
          AND name = ${promptName}
          AND version = ${promptVersion} 
        FOR UPDATE -- Important! This will lock the row for concurrent updates
      `
      )[0];

      if (!prompt) {
        throw new LangfuseNotFoundError(`Prompt not found: ${promptName}`);
      }

      const newLabelsSet = new Set([...newLabels, ...prompt.labels]);
      const removedLabels = [];

      // Prompt labels cannot be removed here since the newLabelsSet includes the old labels
      // Keeping this dependent check below as a safeguard in case the above changes
      for (const oldLabel of prompt.labels) {
        if (!newLabelsSet.has(oldLabel)) {
          removedLabels.push(oldLabel);
        }
      }

      if (removedLabels.length > 0) {
        const dependents = await tx.$queryRaw<
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
            AND pd.child_name = ${promptName}
            AND pd."child_label" IS NOT NULL AND pd."child_label" IN (${Prisma.join(removedLabels)})
        `;

        if (dependents.length > 0) {
          const dependencyMessages = dependents
            .map(
              (d) =>
                `${d.parent_name} v${d.parent_version} depends on ${promptName} ${d.child_version ? `v${d.child_version}` : d.child_label}`,
            )
            .join("\n");

          throw new InvalidRequestError(
            `Other prompts are depending on the prompt label you are trying to remove:\n\n${dependencyMessages}\n\nPlease delete the dependent prompts first.`,
          );
        }
      }

      logger.info(
        `Setting labels for prompt: ${prompt.id}, ${prompt.name}, ${prompt.version}, ${JSON.stringify(
          Array.from(newLabelsSet),
        )}`,
      );

      const result = await Promise.all([
        // Remove labels from other prompts
        ...(await removeLabelsFromPreviousPromptVersions({
          prisma: tx,
          projectId,
          promptName,
          labelsToRemove: [...new Set(newLabels)],
        })),
        // Update prompt
        tx.prompt.update({
          where: {
            id: prompt.id,
            projectId,
          },
          data: {
            labels: {
              set: Array.from(newLabelsSet),
            },
          },
        }),
      ]);

      return result[result.length - 1];
    });

    await promptService.invalidateCache({ projectId, promptName: promptName });
    await promptService.unlockCache({ projectId, promptName: promptName });

    return result;
  } catch (e) {
    await promptService.unlockCache({ projectId, promptName: promptName });

    throw e;
  }
};
