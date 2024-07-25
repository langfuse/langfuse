import { PRODUCTION_LABEL } from "@/src/features/prompts/constants";
import { InvalidRequestError, type Prompt } from "@langfuse/shared";
import { PromptService, redis } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import * as Sentry from "@sentry/nextjs";

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
  const promptService = new PromptService(
    prisma,
    redis,
    Sentry.metrics.increment,
  );

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
