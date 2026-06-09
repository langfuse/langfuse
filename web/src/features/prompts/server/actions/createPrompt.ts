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
  escapeSqlLikePattern,
  redis,
  extractPlaceholderNames,
} from "@langfuse/shared/src/server";
import { promptChangeEventSourcing } from "@/src/features/prompts/server/promptChangeEventSourcing";

export type CreatePromptParams = CreatePromptTRPCType & {
  createdBy: string;
  prisma: PrismaClient;
  user?: { id: string; name: string | null; email: string | null };
};

type DuplicatePromptParams = {
  projectId: string;
  promptId: string;
  name: string;
  isSingleVersion: boolean;
  createdBy: string;
  prisma: PrismaClient;
  user?: { id: string; name: string | null; email: string | null };
};

type DuplicateFolderParams = {
  projectId: string;
  sourcePath: string;
  targetPath: string;
  isSingleVersion: boolean;
  rewritePromptReferences?: boolean;
  createdBy: string;
  prisma: PrismaClient;
  user?: { id: string; name: string | null; email: string | null };
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
  user,
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

  // Create prompt and update previous prompt versions
  const [createdPrompt] = (await prisma.$transaction(create)) as [
    Prompt,
    ...PromptDependency[],
  ];

  // Rotate cache epoch only after successful commit.
  await promptService.invalidateCache({ projectId });

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
        user,
      ),
    ),
    promptChangeEventSourcing(
      await promptService.resolvePrompt(createdPrompt),
      "created",
      user,
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
  user,
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
  await prisma.$transaction(async (tx) => {
    await tx.prompt.createMany({
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
  });

  const promptService = new PromptService(prisma, redis);
  await promptService.invalidateCache({ projectId });

  // Fetch the created prompt to return
  const createdPrompt = await prisma.prompt.findUnique({
    where: {
      projectId_name_version: {
        projectId,
        name,
        version: isSingleVersion ? 1 : existingPrompt.version,
      },
    },
  });

  await Promise.all(
    promptsToCreate.map(async (prompt) =>
      promptChangeEventSourcing(
        await promptService.resolvePrompt(prompt),
        "created",
        user,
      ),
    ),
  );

  return createdPrompt;
};

const rewriteDuplicatedPromptContent = ({
  prompt,
  duplicatedPromptNames,
  isSingleVersion,
}: {
  prompt: ReturnType<typeof PromptContentSchema.parse>;
  duplicatedPromptNames: Map<string, string>;
  isSingleVersion: boolean;
}) => {
  let rewrittenPrompt = JSON.stringify(prompt);

  for (const dep of parsePromptDependencyTags(prompt)) {
    const duplicatedDependencyName = duplicatedPromptNames.get(dep.name);

    if (!duplicatedDependencyName) continue;

    const currentTag =
      dep.type === "version"
        ? `@@@langfusePrompt:name=${dep.name}|version=${dep.version}@@@`
        : `@@@langfusePrompt:name=${dep.name}|label=${dep.label}@@@`;

    const rewrittenTag =
      dep.type === "version"
        ? `@@@langfusePrompt:name=${duplicatedDependencyName}|version=${isSingleVersion ? 1 : dep.version}@@@`
        : `@@@langfusePrompt:name=${duplicatedDependencyName}|label=${dep.label}@@@`;

    rewrittenPrompt = rewrittenPrompt.split(currentTag).join(rewrittenTag);
  }

  return PromptContentSchema.parse(JSON.parse(rewrittenPrompt));
};

export const duplicateFolder = async ({
  projectId,
  sourcePath,
  targetPath,
  isSingleVersion,
  rewritePromptReferences = false,
  createdBy,
  prisma,
  user,
}: DuplicateFolderParams) => {
  const escapedTargetPath = escapeSqlLikePattern(targetPath);
  const escapedSourcePath = escapeSqlLikePattern(sourcePath);

  const existingTargetPrompt = await prisma.prompt.findFirst({
    where: {
      projectId,
      name: { startsWith: `${escapedTargetPath}/` },
    },
  });

  if (existingTargetPrompt) {
    throw new InvalidRequestError(
      `Prompts already exist under the target path "${targetPath}/". Please choose a different target path.`,
    );
  }

  // Find all prompts under the source folder, including nested subfolders
  const sourcePrompts = await prisma.prompt.findMany({
    where: {
      projectId,
      name: { startsWith: `${escapedSourcePath}/` },
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
    orderBy: [{ name: "asc" }, { version: "asc" }],
  });

  if (sourcePrompts.length === 0) {
    throw new InvalidRequestError(
      `No prompts found under the source path "${sourcePath}/".`,
    );
  }

  // Group by name: each unique prompt name may have multiple versions
  const promptsByName = new Map<string, (typeof sourcePrompts)[number][]>();
  for (const prompt of sourcePrompts) {
    const existing = promptsByName.get(prompt.name) ?? [];
    existing.push(prompt);
    promptsByName.set(prompt.name, existing);
  }

  const oldToNewIdMap: Record<string, string> = {};
  const duplicatedPromptNames = new Map(
    [...promptsByName.keys()].map((originalName) => [
      originalName,
      `${targetPath}${originalName.slice(sourcePath.length)}`,
    ]),
  );
  const allPromptsToCreate: Array<{
    id: string;
    name: string;
    version: number;
    labels: string[];
    type: string;
    prompt: ReturnType<typeof PromptContentSchema.parse>;
    config: ReturnType<typeof jsonSchema.parse>;
    tags: string[];
    projectId: string;
    createdBy: string;
    commitMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
    isActive: boolean;
  }> = [];

  for (const [originalName, versions] of promptsByName) {
    const latestVersion =
      versions.find((version) =>
        version.labels.includes(LATEST_PROMPT_LABEL),
      ) ?? versions.reduce((a, b) => (a.version > b.version ? a : b));

    const newName =
      duplicatedPromptNames.get(originalName) ??
      `${targetPath}${originalName.slice(sourcePath.length)}`;

    const promptsToCopy = isSingleVersion ? [latestVersion] : versions;

    for (const prompt of promptsToCopy) {
      const newPromptId = uuidv4();
      oldToNewIdMap[prompt.id] = newPromptId;

      allPromptsToCreate.push({
        id: newPromptId,
        name: newName,
        version: isSingleVersion ? 1 : prompt.version,
        labels: isSingleVersion
          ? [...new Set([LATEST_PROMPT_LABEL, ...prompt.labels])]
          : prompt.labels,
        type: prompt.type,
        prompt: rewritePromptReferences
          ? rewriteDuplicatedPromptContent({
              prompt: PromptContentSchema.parse(prompt.prompt),
              duplicatedPromptNames,
              isSingleVersion,
            })
          : PromptContentSchema.parse(prompt.prompt),
        config: jsonSchema.parse(prompt.config),
        tags: prompt.tags,
        projectId,
        createdBy,
        commitMessage: prompt.commitMessage,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.prompt.createMany({
      data: allPromptsToCreate,
    });

    await tx.promptDependency.createMany({
      data: sourcePrompts
        .filter((prompt) => oldToNewIdMap[prompt.id] !== undefined)
        .flatMap((prompt) =>
          prompt.PromptDependency.map((dep) => {
            const duplicatedDependencyName = rewritePromptReferences
              ? duplicatedPromptNames.get(dep.childName)
              : undefined;

            return {
              projectId,
              parentId: oldToNewIdMap[prompt.id],
              childName: duplicatedDependencyName ?? dep.childName,
              childVersion:
                duplicatedDependencyName && dep.childVersion && isSingleVersion
                  ? 1
                  : dep.childVersion,
              childLabel: dep.childLabel,
            };
          }),
        ),
    });
  });

  const promptService = new PromptService(prisma, redis);

  await promptService.invalidateCache({ projectId });

  await Promise.all(
    allPromptsToCreate.map(async (prompt) =>
      promptChangeEventSourcing(
        await promptService.resolvePrompt(prompt),
        "created",
        user,
      ),
    ),
  );

  return {
    copiedPromptNames: [...duplicatedPromptNames.values()],
    copiedCount: allPromptsToCreate.length,
  };
};
