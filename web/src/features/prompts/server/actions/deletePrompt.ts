import { InvalidRequestError, LangfuseNotFoundError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { PromptService, redis, logger } from "@langfuse/shared/src/server";

export type DeletePromptParams = {
  promptName: string;
  projectId: string;
  version?: number | null;
  label?: string;
};

export const deletePrompt = async (params: DeletePromptParams) => {
  const { promptName, projectId, version, label } = params;

  if (version && label) {
    throw new InvalidRequestError("Cannot specify both version and label");
  }

  const where = {
    projectId,
    name: promptName,
    ...(version ? { version } : {}),
    ...(label ? { labels: { has: label } } : {}),
  };

  const prompts = await prisma.prompt.findMany({ where });

  if (prompts.length === 0) {
    throw new LangfuseNotFoundError("Prompt not found");
  }

  const promptService = new PromptService(prisma, redis);

  try {
    await promptService.lockCache({ projectId, promptName });
    await promptService.invalidateCache({ projectId, promptName });

    await prisma.prompt.deleteMany({
      where: { projectId, id: { in: prompts.map((p) => p.id) } },
    });
  } catch (err) {
    logger.error(err, "Failed to delete prompt");
    throw err;
  } finally {
    await promptService.unlockCache({ projectId, promptName });
  }
};
