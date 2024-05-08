import {
  type CreatePromptTRPCType,
  PromptType,
} from "@/src/features/prompts/server/utils/validation";
import { ValidationError } from "@langfuse/shared";
import { jsonSchema } from "@/src/utils/zod";
import { type PrismaClient } from "@langfuse/shared/src/db";
import { LATEST_PROMPT_LABEL } from "@/src/features/prompts/constants";

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

  const previousLabeledPrompts = await prisma.prompt.findMany({
    where: {
      projectId,
      name,
      labels: { hasSome: finalLabels },
    },
    orderBy: [{ version: "desc" }],
  });

  const create = [
    prisma.prompt.create({
      data: {
        prompt,
        name,
        createdBy,
        labels: [...new Set(finalLabels)], // Ensure labels are unique
        type,
        tags: latestPrompt?.tags,
        version: latestPrompt?.version ? latestPrompt.version + 1 : 1,
        project: { connect: { id: projectId } },
        config: jsonSchema.parse(config),
      },
    }),
  ];

  if (finalLabels.length > 0)
    // If we're creating a new labeled prompt, we must remove those labels on previous prompts since labels are unique
    previousLabeledPrompts.forEach((prevPrompt) => {
      create.push(
        prisma.prompt.update({
          where: { id: prevPrompt.id },
          data: {
            labels: prevPrompt.labels.filter(
              (prevLabel) => !finalLabels.includes(prevLabel),
            ),
          },
        }),
      );
    });

  const [createdPrompt] = await prisma.$transaction(create);

  return createdPrompt;
};
