import { type PrismaClient } from "@langfuse/shared/src/db";

export const updatePromptTagsOnAllVersions = async ({
  prisma,
  projectId,
  promptName,
  tags,
}: {
  prisma: PrismaClient;
  projectId: string;
  promptName: string;
  tags: string[];
}) => {
  const previousVersions = await prisma.prompt.findMany({
    where: { projectId, name: promptName },
  });

  if (previousVersions.length === 0)
    return { touchedPromptIds: [], updates: [] };

  const touchedPromptIds = previousVersions.map(
    (prevVersion) => prevVersion.id,
  );

  return {
    touchedPromptIds,
    updates: previousVersions.map((prevVersion) =>
      prisma.prompt.update({
        where: { id: prevVersion.id },
        data: {
          tags: [...new Set(tags)], // Ensure tags are unique
        },
      }),
    ),
  };
};
