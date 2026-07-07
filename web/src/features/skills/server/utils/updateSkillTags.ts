import { type PrismaClient } from "@langfuse/shared/src/db";

export const updateSkillTagsOnAllVersions = async ({
  prisma,
  projectId,
  skillName,
  tags,
}: {
  prisma: PrismaClient;
  projectId: string;
  skillName: string;
  tags: string[];
}) => {
  const previousVersions = await prisma.skill.findMany({
    where: { projectId, name: skillName },
  });

  if (previousVersions.length === 0)
    return { touchedSkillIds: [], updates: [] };

  const touchedSkillIds = previousVersions.map((prevVersion) => prevVersion.id);

  return {
    touchedSkillIds,
    updates: previousVersions.map((prevVersion) =>
      prisma.skill.update({
        where: { id: prevVersion.id },
        data: {
          tags: [...new Set(tags)], // Ensure tags are unique
        },
      }),
    ),
  };
};
