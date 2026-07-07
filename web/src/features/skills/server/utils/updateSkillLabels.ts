import { type PrismaClient } from "@langfuse/shared/src/db";

export const removeLabelsFromPreviousSkillVersions = async ({
  prisma,
  projectId,
  skillName,
  labelsToRemove,
}: {
  prisma: Omit<
    PrismaClient,
    "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
  >;
  projectId: string;
  skillName: string;
  labelsToRemove: string[];
}) => {
  const previouslyLabeledSkills = await prisma.skill.findMany({
    where: {
      projectId,
      name: skillName,
      labels: { hasSome: labelsToRemove },
    },
    orderBy: [{ version: "desc" }],
  });

  const touchedSkillIds = previouslyLabeledSkills.map(
    (prevSkill) => prevSkill.id,
  );

  return {
    touchedSkillIds,
    updates: previouslyLabeledSkills.map((prevSkill) =>
      prisma.skill.update({
        where: { id: prevSkill.id },
        data: {
          labels: prevSkill.labels.filter(
            (prevLabel) => !labelsToRemove.includes(prevLabel),
          ),
        },
      }),
    ),
  };
};
