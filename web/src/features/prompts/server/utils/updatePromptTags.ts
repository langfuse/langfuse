import { type PrismaClient } from "@langfuse/shared/src/db";

export const updatePromptTags = async (
  prisma: PrismaClient,
  projectId: string,
  name: string,
  tags: string[],
) => {
  const previousVersions = await prisma.prompt.findMany({
    where: { projectId, name },
  });

  if (previousVersions.length === 0) return [];

  return previousVersions.map((prevVersion) =>
    prisma.prompt.update({
      where: { id: prevVersion.id },
      data: {
        tags: [...new Set(tags)], // Ensure tags are unique
      },
    }),
  );
};
