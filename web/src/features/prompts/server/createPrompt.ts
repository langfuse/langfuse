import {
  type CreatePromptTRPCType,
  PromptType,
} from "@/src/features/prompts/server/validation";
import { ValidationError } from "@langfuse/shared";
import { jsonSchema } from "@/src/utils/zod";
import { type PrismaClient } from "@langfuse/shared/src/db";

export const createPrompt = async ({
  projectId,
  name,
  prompt,
  type = PromptType.Text,
  labels = [],
  config,
  createdBy,
  prisma,
}: CreatePromptTRPCType & {
  createdBy: string;
  prisma: PrismaClient;
}) => {
  const latestPrompt = await prisma.prompt.findFirst({
    where: { projectId, name },
    orderBy: [{ version: "desc" }],
  });

  if (latestPrompt && latestPrompt.type !== type) {
    throw new ValidationError(
      "Previous versions have different prompt type. Create a new prompt with a different name.",
    );
  }

  const previousLabeledPrompts = await prisma.prompt.findMany({
    where: { projectId, name, labels: { hasSome: labels } },
    orderBy: [{ version: "desc" }],
  });

  const create = [
    prisma.prompt.create({
      data: {
        prompt,
        name,
        createdBy,
        labels: [...new Set(labels)], // Ensure labels are unique
        type,
        tags: latestPrompt?.tags,
        version: latestPrompt?.version ? latestPrompt.version + 1 : 1,
        project: { connect: { id: projectId } },
        config: jsonSchema.parse(config),
      },
    }),
  ];
  if (labels.length > 0)
    // If we're creating a new labeled prompt, we must remove those labels on previous prompts since labels are unique
    previousLabeledPrompts.forEach((prevPrompt) => {
      create.push(
        prisma.prompt.update({
          where: { id: prevPrompt.id },
          data: {
            labels: prevPrompt.labels.filter(
              (prevLabel) => !labels.includes(prevLabel),
            ),
          },
        }),
      );
    });

  const [createdPrompt] = await prisma.$transaction(create);

  return createdPrompt;
};
