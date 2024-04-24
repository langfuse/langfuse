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
  isActive = true,
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

  const latestActivePrompt = await prisma.prompt.findFirst({
    where: { projectId, name, isActive: true },
    orderBy: [{ version: "desc" }],
  });

  const create = [
    prisma.prompt.create({
      data: {
        prompt,
        name,
        createdBy,
        isActive,
        type,
        tags: latestPrompt?.tags,
        version: latestPrompt?.version ? latestPrompt.version + 1 : 1,
        project: { connect: { id: projectId } },
        config: jsonSchema.parse(config),
      },
    }),
  ];
  if (latestActivePrompt && isActive)
    // If we're creating a new active prompt, we need to deactivate the old one
    create.push(
      prisma.prompt.update({
        where: {
          id: latestActivePrompt.id,
        },
        data: {
          isActive: false,
        },
      }),
    );

  const [createdPrompt] = await prisma.$transaction(create);

  return createdPrompt;
};
