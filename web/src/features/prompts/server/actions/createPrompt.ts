import { v4 as uuidv4 } from "uuid";
import {
  InvalidRequestError,
  parsePromptDependencyTags,
  jsonSchema,
  type PromptDependency,
  type Prompt,
  type CreatePromptTRPCType,
  LATEST_PROMPT_LABEL,
  PromptType,
  extractVariables,
} from "@langfuse/shared";
import { type PrismaClient } from "@langfuse/shared/src/db";
import { removeLabelsFromPreviousPromptVersions } from "@/src/features/prompts/server/utils/updatePromptLabels";
import { updatePromptTagsOnAllVersions } from "@/src/features/prompts/server/utils/updatePromptTags";
import {
  PromptContentSchema,
  PromptService,
  redis,
  extractPlaceholderNames,
} from "@langfuse/shared/src/server";
import { promptChangeEventSourcing } from "@/src/features/prompts/server/promptChangeEventSourcing";

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

const extractChatVariableAndPlaceholderNames = (
  chatPrompt: Array<any>,
): { variables: string[]; placeholders: string[] } => {
  const placeholders = extractPlaceholderNames(chatPrompt);

  const variables: string[] = [];
  for (const message of chatPrompt) {
    if (
      message &&
      "content" in message &&
      typeof message.content === "string"
    ) {
      variables.push(...extractVariables(message.content));
    }
  }

  return {
    variables: [...new Set(variables)],
    placeholders: [...new Set(placeholders)],
  };
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

  // Prevent naming collisions between variables and placeholders
  if (type === PromptType.Chat && Array.isArray(prompt)) {
    const { variables, placeholders } =
      extractChatVariableAndPlaceholderNames(prompt);
    const conflictingNames = variables.filter((v) => placeholders.includes(v));
    if (conflictingNames.length > 0) {
      throw new InvalidRequestError(
        `Cannot create prompt, variables and placeholders must be unique, the following are not: ${conflictingNames.join(", ")}`,
      );
    }
  }

  const finalLabels = [...labels, LATEST_PROMPT_LABEL]; // Newly created prompts are always labeled as 'latest'

  // If tags are undefined, use the tags from the latest prompt version
  const finalTags = [...new Set(tags ?? latestPrompt?.tags ?? [])];
  const newPromptId = uuidv4();

  const promptService = new PromptService(prisma, redis);
  const promptDependencies = parsePromptDependencyTags(prompt);

  const touchedPromptIds: string[] = [];

  try {
    await promptService.buildAndResolvePromptGraph({
      projectId,
      parentPrompt: {
        id: newPromptId,
        prompt,
        version: latestPrompt?.version ? latestPrompt.version + 1 : 1,
        name,
        labels,
      },
      dependencies: promptDependencies,
    });
  } catch (err) {
    console.error(`Error in prompt ${name}:`, err);

    throw new InvalidRequestError(
      err instanceof Error ? err.message : "Failed to resolve dependency graph",
    );
  }

  const create = [
    prisma.prompt.create({
      data: {
        id: newPromptId,
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
    ...promptDependencies.map((dep) =>
      prisma.promptDependency.create({
        data: {
          projectId,
          parentId: newPromptId,
          childName: dep.name,
          ...(dep.type === "version"
            ? { childVersion: dep.version }
            : { childLabel: dep.label }),
        },
      }),
    ),
  ];

  if (finalLabels.length > 0) {
    // If we're creating a new labeled prompt, we must remove those labels on previous prompts since labels are unique
    const {
      touchedPromptIds: touchedPromptIdsPrevPrompts,
      updates: updatesPrevPrompts,
    } = await removeLabelsFromPreviousPromptVersions({
      prisma,
      projectId,
      promptName: name,
      labelsToRemove: finalLabels,
    });
    touchedPromptIds.push(...touchedPromptIdsPrevPrompts);
    create.push(...updatesPrevPrompts);
  }

  const haveTagsChanged =
    JSON.stringify([...new Set(finalTags)].sort()) !==
    JSON.stringify([...new Set(latestPrompt?.tags)].sort());
  if (haveTagsChanged) {
    // If we're creating a new prompt with tags, we must update those tags on previous prompts since tags are consistent across versions
    const { touchedPromptIds: touchedPromptIdsTags, updates: updatesTags } =
      await updatePromptTagsOnAllVersions({
        prisma,
        projectId,
        promptName: name,
        tags: finalTags,
      });
    touchedPromptIds.push(...touchedPromptIdsTags);
    create.push(...updatesTags);
  }

  // Lock and invalidate cache for _all_ versions and labels of the prompt name
  await promptService.lockCache({ projectId, promptName: name });
  await promptService.invalidateCache({ projectId, promptName: name });

  // Create prompt and update previous prompt versions
  const [createdPrompt] = (await prisma.$transaction(create)) as [
    Prompt,
    ...PromptDependency[],
  ];

  // Unlock cache
  await promptService.unlockCache({ projectId, promptName: name });

  const updatedPrompts = await prisma.prompt.findMany({
    where: {
      id: { in: touchedPromptIds },
      projectId,
    },
  });

  await Promise.all([
    ...updatedPrompts.map(async (prompt) =>
      promptChangeEventSourcing(
        await promptService.resolvePrompt(prompt),
        "updated",
      ),
    ),
    promptChangeEventSourcing(
      await promptService.resolvePrompt(createdPrompt),
      "created",
    ),
  ]);

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
    throw new InvalidRequestError(`Existing prompt not found: ${promptId}`);
  }

  // if defined as single version, duplicate current prompt as new prompt v1
  // else duplicate the entire prompt, should be all or nothing operation.
  const promptsDb = await prisma.prompt.findMany({
    where: {
      projectId: projectId,
      name: existingPrompt.name,
      version: isSingleVersion ? existingPrompt.version : undefined,
    },
    include: {
      PromptDependency: {
        select: {
          childName: true,
          childLabel: true,
          childVersion: true,
        },
      },
    },
  });

  // prepare createMany prompt records
  const oldToNewIdMap: Record<string, string> = {};

  const promptsToCreate = promptsDb.map((prompt) => {
    const newPromptId = uuidv4();

    oldToNewIdMap[prompt.id] = newPromptId;

    return {
      id: newPromptId,
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
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
    };
  });

  // Create all prompts in a single operation
  const result = await prisma.$transaction(async (tx) => {
    const promptResult = await tx.prompt.createMany({
      data: promptsToCreate,
    });

    await tx.promptDependency.createMany({
      data: promptsDb.flatMap((prompt) =>
        prompt.PromptDependency.map((dep) => ({
          projectId,
          parentId: oldToNewIdMap[prompt.id],
          childName: dep.childName,
          childVersion: dep.childVersion,
          childLabel: dep.childLabel,
        })),
      ),
    });

    return promptResult;
  });

  // Fetch the created prompt to return
  const createdPrompt = await prisma.prompt.findFirst({
    where: {
      name,
      projectId,
      version: isSingleVersion ? 1 : result.count,
    },
  });

  const promptService = new PromptService(prisma, redis);

  await Promise.all(
    promptsToCreate.map(async (prompt) =>
      promptChangeEventSourcing(
        await promptService.resolvePrompt(prompt),
        "created",
      ),
    ),
  );

  return createdPrompt;
};
