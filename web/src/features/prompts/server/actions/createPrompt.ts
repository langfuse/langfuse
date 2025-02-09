import {
  type CreatePromptTRPCType,
  PromptType,
} from "@/src/features/prompts/server/utils/validation";
import { InvalidRequestError } from "@langfuse/shared";
import { jsonSchema } from "@langfuse/shared";
import { type PrismaClient } from "@langfuse/shared/src/db";
import { LATEST_PROMPT_LABEL } from "@/src/features/prompts/constants";
import { removeLabelsFromPreviousPromptVersions } from "@/src/features/prompts/server/utils/updatePromptLabels";
import { updatePromptTagsOnAllVersions } from "@/src/features/prompts/server/utils/updatePromptTags";
import {
  PromptContentSchema,
  PromptService,
  redis,
} from "@langfuse/shared/src/server";

export type CreatePromptParams = CreatePromptTRPCType & {
  createdBy: string;
  prisma: PrismaClient;
};

type DuplicatePromptParams = {
  projectId: string;
  promptId: string;
  name: string;
  isSingleVersion: boolean;
  createdBy: string;
  prisma: PrismaClient;
};

export const createPrompt = async ({
  projectId,
  name,
  prompt,
  type = PromptType.Text,
  labels = [],
  config,
  createdBy,
  prisma,
  tags,
  commitMessage,
}: CreatePromptParams) => {
  const latestPrompt = await prisma.prompt.findFirst({
    where: { projectId, name },
    orderBy: [{ version: "desc" }],
  });

  if (latestPrompt && latestPrompt.type !== type) {
    throw new InvalidRequestError(
      "Previous versions have different prompt type. Create a new prompt with a different name.",
    );
  }

  const finalLabels = [...labels, LATEST_PROMPT_LABEL]; // Newly created prompts are always labeled as 'latest'

  // If tags are undefined, use the tags from the latest prompt version
  const finalTags = [...new Set(tags ?? latestPrompt?.tags ?? [])];

  const create = [
    prisma.prompt.create({
      data: {
        prompt,
        name,
        createdBy,
        labels: [...new Set(finalLabels)], // Ensure labels are unique
        type,
        tags: finalTags,
        version: latestPrompt?.version ? latestPrompt.version + 1 : 1,
        project: { connect: { id: projectId } },
        config: jsonSchema.parse(config),
        commitMessage,
      },
    }),
  ];

  if (finalLabels.length > 0)
    // If we're creating a new labeled prompt, we must remove those labels on previous prompts since labels are unique
    create.push(
      ...(await removeLabelsFromPreviousPromptVersions({
        prisma,
        projectId,
        promptName: name,
        labelsToRemove: finalLabels,
      })),
    );

  const haveTagsChanged =
    JSON.stringify([...new Set(finalTags)].sort()) !==
    JSON.stringify([...new Set(latestPrompt?.tags)].sort());
  if (haveTagsChanged)
    // If we're creating a new prompt with tags, we must update those tags on previous prompts since tags are consistent across versions
    create.push(
      ...(await updatePromptTagsOnAllVersions({
        prisma,
        projectId,
        promptName: name,
        tags: finalTags,
      })),
    );

  // Lock and invalidate cache for _all_ versions and labels of the prompt name
  const promptService = new PromptService(prisma, redis);
  await promptService.lockCache({ projectId, promptName: name });
  await promptService.invalidateCache({ projectId, promptName: name });

  // Create prompt and update previous prompt versions
  const [createdPrompt] = await prisma.$transaction(create);

  // Unlock cache
  await promptService.unlockCache({ projectId, promptName: name });

  return createdPrompt;
};

export const duplicatePrompt = async ({
  projectId,
  promptId,
  name,
  isSingleVersion,
  createdBy,
  prisma,
}: DuplicatePromptParams) => {
  // validate that name is unique in project, uniqueness constraint too permissive as it includes version
  const promptNameExists = await prisma.prompt.findFirst({
    where: {
      projectId,
      name,
    },
  });

  if (promptNameExists) {
    throw new InvalidRequestError(
      `Prompt name ${name} already exists in project ${projectId}`,
    );
  }

  const existingPrompt = await prisma.prompt.findUnique({
    where: {
      id: promptId,
      projectId: projectId,
    },
  });

  if (!existingPrompt) {
    throw new Error(`Existing prompt not found: ${promptId}`);
  }

  // if defined as single version, duplicate current prompt as new prompt v1
  // else duplicate the entire prompt, should be all or nothing operation.
  const promptsDb = await prisma.prompt.findMany({
    where: {
      projectId: projectId,
      name: existingPrompt.name,
      version: isSingleVersion ? existingPrompt.version : undefined,
    },
  });

  // prepare createMany prompt records
  const promptsToCreate = promptsDb.map((prompt) => ({
    name,
    version: isSingleVersion ? 1 : prompt.version,
    labels: isSingleVersion
      ? [...new Set([LATEST_PROMPT_LABEL, ...prompt.labels])]
      : prompt.labels,
    type: prompt.type,
    prompt: PromptContentSchema.parse(prompt.prompt),
    config: jsonSchema.parse(prompt.config),
    tags: prompt.tags,
    projectId,
    createdBy,
    commitMessage: prompt.commitMessage,
  }));

  // Create all prompts in a single operation
  const result = await prisma.prompt.createMany({
    data: promptsToCreate,
  });

  // If you need the created prompt, fetch it separately since createMany doesn't return created records
  const createdPrompt = await prisma.prompt.findFirst({
    where: {
      name,
      projectId,
      version: isSingleVersion ? 1 : result.count,
    },
  });

  return createdPrompt;
};
