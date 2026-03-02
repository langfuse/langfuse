import {
  InvalidRequestError,
  PRODUCTION_LABEL,
  type Prompt,
} from "@langfuse/shared";
import {
  isOceanBase,
  PromptService,
  redis,
  recordIncrement,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";

type GetPromptByNameParams = {
  promptName: string;
  projectId: string;
  version?: number | null;
  label?: string;
  resolve?: boolean; // If false, returns raw prompt without resolving dependencies
};

export const getPromptByName = async (
  params: GetPromptByNameParams,
): Promise<Prompt | null> => {
  const { promptName, projectId, version, label, resolve = true } = params;

  if (version && label)
    throw new InvalidRequestError("Cannot specify both version and label");

  // If resolve is false, fetch directly from database without resolving dependencies
  if (!resolve) {
    if (version) {
      return prisma.prompt.findFirst({
        where: {
          projectId,
          name: promptName,
          version,
        },
      });
    }

    const targetLabel = label ?? PRODUCTION_LABEL;
    if (isOceanBase()) {
      const prompts = await prisma.prompt.findMany({
        where: { projectId, name: promptName },
        orderBy: { version: "desc" },
      });
      const match = prompts.find((p) =>
        (p.labels as string[]).includes(targetLabel),
      );
      return match ?? null;
    }
    return prisma.prompt.findFirst({
      where: {
        projectId,
        name: promptName,
        labels: {
          // @ts-ignore
          has: targetLabel,
        },
      },
    });
  }

  // Default behavior: resolve dependencies using PromptService
  const promptService = new PromptService(prisma, redis, recordIncrement);

  if (version)
    return promptService.getPrompt({
      projectId,
      promptName,
      version,
      label: undefined,
    });

  if (label)
    return promptService.getPrompt({
      projectId,
      promptName,
      label,
      version: undefined,
    });

  return promptService.getPrompt({
    projectId,
    promptName,
    label: PRODUCTION_LABEL,
    version: undefined,
  });
};
