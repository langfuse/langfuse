import { getPromptByName } from "@/src/features/prompts/server/actions/getPromptByName";
import { logger, PromptService } from "@langfuse/shared/src/server";
import { removeLabelsFromPreviousPromptVersions } from "@/src/features/prompts/server/utils/updatePromptLabels";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { redis } from "@langfuse/shared/src/server";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { z } from "zod";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";

export type UpdatePromptParams = {
  promptName: string;
  projectId: string;
  promptVersion: number;
  newLabels: string[];
};

export const updatePrompt = async (params: UpdatePromptParams) => {
  const { promptName, projectId, promptVersion, newLabels } = params;
  const promptService = new PromptService(prisma, redis);
  try {
    await promptService.lockCache({ projectId, promptName: promptName });

    const prompt = await getPromptByName({
      promptName,
      projectId,
      version: promptVersion,
      label: undefined,
    });

    if (!prompt) {
      throw new LangfuseNotFoundError(`Prompt not found: ${promptName}`);
    }

    const tx = [
      prisma.prompt.update({
        where: {
          projectId_name_version: {
            projectId,
            name: promptName,
            version: promptVersion,
          },
        },
        data: {
          labels: {
            push: [...new Set([...newLabels, ...prompt.labels])],
          },
        },
      }),
      ...(await removeLabelsFromPreviousPromptVersions({
        prisma,
        projectId,
        promptName,
        labelsToRemove: [...new Set(newLabels)],
      })),
    ];

    await promptService.invalidateCache({ projectId, promptName: promptName });

    await prisma.$transaction(tx);

    await promptService.unlockCache({ projectId, promptName: promptName });

    return prompt;
  } catch (e) {
    await promptService.unlockCache({ projectId, promptName: promptName });
    throw e;
  }
};

const UpdatePromptBodySchema = z.object({
  newLabels: z.array(z.string()),
});

export const promptNameHandler = withMiddlewares({
  PATCH: createAuthedAPIRoute({
    name: "Update Prompt",
    bodySchema: UpdatePromptBodySchema,
    responseSchema: z.any(),
    fn: async ({ body, res, req }) => {
      try {
        const { newLabels } = UpdatePromptBodySchema.parse(body);
        const { promptName, projectId, promptVersion } = req.query;

        const prompt = await updatePrompt({
          promptName: promptName as string,
          projectId: projectId as string,
          promptVersion: Number(promptVersion),
          newLabels,
        });

        logger.info("Prompt updated", { prompt });

        return res.status(200).json(prompt);
      } catch (e) {
        if (e instanceof LangfuseNotFoundError) {
          return res.status(404).json({ message: e.message });
        }
        logger.error(e);
        throw e;
      }
    },
  }),
});
