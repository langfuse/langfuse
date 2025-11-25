import { type PrismaClient } from "@langfuse/shared/src/db";

export const removeLabelsFromPreviousPromptVersions = async ({
  prisma,
  projectId,
  promptName,
  labelsToRemove,
}: {
  prisma: Omit<
    PrismaClient,
    "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
  >;
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

  const touchedPromptIds = previouslyLabeledPrompts.map(
    (prevPrompt) => prevPrompt.id,
  );

  return {
    touchedPromptIds,
    updates: previouslyLabeledPrompts.map((prevPrompt) =>
      prisma.prompt.update({
        where: { id: prevPrompt.id },
        data: {
          labels: prevPrompt.labels.filter(
            (prevLabel) => !labelsToRemove.includes(prevLabel),
          ),
        },
      }),
    ),
  };
};
