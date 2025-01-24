import { logger, PromptService } from "@langfuse/shared/src/server";
import { removeLabelsFromPreviousPromptVersions } from "@/src/features/prompts/server/utils/updatePromptLabels";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
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

    const prompt = await promptService.getPrompt({
      projectId,
      promptName,
      version: promptVersion,
      label: undefined,
    });

    if (!prompt) {
      throw new LangfuseNotFoundError(`Prompt not found: ${promptName}`);
    }

    const newLabelsSet = new Set([...newLabels, ...prompt.labels]);

    logger.info(
      `Setting labels for prompt: ${prompt.id}, ${prompt.name}, ${prompt.version}, ${JSON.stringify(
        Array.from(newLabelsSet),
      )}`,
    );

    const tx = [
      ...(await removeLabelsFromPreviousPromptVersions({
        prisma,
        projectId,
        promptName,
        labelsToRemove: [...new Set(newLabels)],
      })),
      prisma.prompt.update({
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
    ];

    await promptService.invalidateCache({ projectId, promptName: promptName });

    const res = await prisma.$transaction(tx);

    await promptService.unlockCache({ projectId, promptName: promptName });

    return res[res.length - 1];
  } catch (e) {
    await promptService.unlockCache({ projectId, promptName: promptName });
    throw e;
  }
};
