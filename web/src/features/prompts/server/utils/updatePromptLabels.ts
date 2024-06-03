import { type PrismaClient } from "@langfuse/shared/src/db";

export const updatePromptLabels = async (
  prisma: PrismaClient,
  projectId: string,
  name: string,
  finalLabels: string[],
) => {
  const previousLabeledPrompts = await prisma.prompt.findMany({
    where: {
      projectId,
      name,
      labels: { hasSome: finalLabels },
    },
    orderBy: [{ version: "desc" }],
  });

  return previousLabeledPrompts.map((prevPrompt) =>
    prisma.prompt.update({
      where: { id: prevPrompt.id },
      data: {
        labels: prevPrompt.labels.filter(
          (prevLabel) => !finalLabels.includes(prevLabel),
        ),
      },
    }),
  );
};
