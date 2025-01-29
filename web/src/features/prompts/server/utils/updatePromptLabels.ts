import { type PrismaClient } from "@langfuse/shared/src/db";

export const removeLabelsFromPreviousPromptVersions = async ({
  prisma,
  projectId,
  promptName,
  labelsToRemove,
}: {
  prisma: PrismaClient;
  projectId: string;
  promptName: string;
  labelsToRemove: string[];
}) => {
  const previouslyLabeledPrompts = await prisma.prompt.findMany({
    where: {
      projectId,
      name: promptName,
      labels: { hasSome: labelsToRemove },
    },
    orderBy: [{ version: "desc" }],
  });

  return previouslyLabeledPrompts.map((prevPrompt) =>
    prisma.prompt.update({
      where: { id: prevPrompt.id },
      data: {
        labels: prevPrompt.labels.filter(
          (prevLabel) => !labelsToRemove.includes(prevLabel),
        ),
      },
    }),
  );
};
