import { prisma } from "@langfuse/shared/src/db";
import type {
  CreatePromptSchema,
  GetPromptByNameSchema,
  GetPromptsMetaSchema,
  Prompt,
} from "@langfuse/shared";
import { InvalidRequestError, LangfuseNotFoundError } from "@langfuse/shared";
import type { z } from "zod";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import { createPrompt } from "./actions/createPrompt";
import { getPromptByName } from "./actions/getPromptByName";
import { getPromptsMeta } from "./actions/getPromptsMeta";
import { updatePrompt } from "./actions/updatePrompts";

type ApiKeyProjectContext = {
  projectId: string;
  orgId: string;
  apiKeyId: string;
};

type ListPromptsForApiInput = z.infer<typeof GetPromptsMetaSchema> & {
  projectId: string;
};

type GetPromptForApiInput = z.infer<typeof GetPromptByNameSchema> & {
  projectId: string;
};

export const listPromptsForApi = async (input: ListPromptsForApiInput) => {
  return await getPromptsMeta(input);
};

export const getPromptForApi = async (input: GetPromptForApiInput) => {
  return await getPromptByName(input);
};

export const createPromptForApi = async ({
  context,
  input,
}: {
  context: ApiKeyProjectContext;
  input: z.infer<typeof CreatePromptSchema>;
}) => {
  const createdPrompt = await createPrompt({
    ...input,
    config: input.config ?? {},
    projectId: context.projectId,
    createdBy: "API",
    prisma,
  }).catch((err) => {
    if (
      typeof err === "object" &&
      err?.constructor.name === "PrismaClientKnownRequestError" &&
      "code" in err &&
      // Unique constraint failed: https://www.prisma.io/docs/orm/reference/error-reference#p2002
      err.code === "P2002"
    ) {
      throw new InvalidRequestError(
        `Failed to create prompt '${input.name}' due to unique constraint failure. This is likely due to too many concurrent prompt creations for this prompt name. Please add a delay.`,
      );
    }

    throw err;
  });

  await auditLog({
    action: "create",
    resourceType: "prompt",
    resourceId: createdPrompt.id,
    projectId: context.projectId,
    orgId: context.orgId,
    apiKeyId: context.apiKeyId,
    after: createdPrompt,
  });

  return createdPrompt;
};

export const updatePromptLabelsForApi = async ({
  context,
  promptName,
  promptVersion,
  newLabels,
}: {
  context: ApiKeyProjectContext;
  promptName: string;
  promptVersion: number;
  newLabels: string[];
}) => {
  const existingPrompt = await prisma.prompt.findUnique({
    where: {
      projectId_name_version: {
        projectId: context.projectId,
        name: promptName,
        version: promptVersion,
      },
    },
  });

  if (!existingPrompt) {
    throw new LangfuseNotFoundError(
      `Prompt '${promptName}' version ${promptVersion} not found in project`,
    );
  }

  const updatedPrompt = await updatePrompt({
    promptName,
    projectId: context.projectId,
    promptVersion,
    newLabels,
  });

  await auditLog({
    action: "update",
    resourceType: "prompt",
    resourceId: updatedPrompt.id,
    projectId: context.projectId,
    orgId: context.orgId,
    apiKeyId: context.apiKeyId,
    before: existingPrompt ?? undefined,
    after: updatedPrompt,
  });

  return { existingPrompt, updatedPrompt } satisfies {
    existingPrompt: Prompt;
    updatedPrompt: Prompt;
  };
};
