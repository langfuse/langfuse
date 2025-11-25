import {
  InvalidRequestError,
  PRODUCTION_LABEL,
  type Prompt,
} from "@langfuse/shared";
import {
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
};

export const getPromptByName = async (
  params: GetPromptByNameParams,
): Promise<Prompt | null> => {
  const { promptName, projectId, version, label } = params;
  const promptService = new PromptService(prisma, redis, recordIncrement);

  if (version && label)
    throw new InvalidRequestError("Cannot specify both version and label");

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
