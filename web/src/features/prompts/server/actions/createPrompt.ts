import {
  type CreatePromptTRPCType,
  PromptType,
} from "@/src/features/prompts/server/utils/validation";
import { ValidationError } from "@langfuse/shared";
import { jsonSchema } from "@langfuse/shared";
import { type PrismaClient } from "@langfuse/shared/src/db";
import { LATEST_PROMPT_LABEL } from "@/src/features/prompts/constants";
import { removeLabelsFromPreviousPromptVersions } from "@/src/features/prompts/server/utils/updatePromptLabels";
import { updatePromptTagsOnAllVersions } from "@/src/features/prompts/server/utils/updatePromptTags";

export type CreatePromptParams = CreatePromptTRPCType & {
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
}: CreatePromptParams) => {
  const latestPrompt = await prisma.prompt.findFirst({
    where: { projectId, name },
    orderBy: [{ version: "desc" }],
  });

  if (latestPrompt && latestPrompt.type !== type) {
    throw new ValidationError(
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

  const [createdPrompt] = await prisma.$transaction(create);

  return createdPrompt;
};
