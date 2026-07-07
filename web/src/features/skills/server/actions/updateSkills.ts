import { logger, SkillService } from "@langfuse/shared/src/server";
import { removeLabelsFromPreviousSkillVersions } from "@/src/features/skills/server/utils/updateSkillLabels";
import { LangfuseNotFoundError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { redis } from "@langfuse/shared/src/server";

export type UpdateSkillParams = {
  skillName: string;
  projectId: string;
  skillVersion: number;
  newLabels: string[];
};

export const updateSkill = async (params: UpdateSkillParams) => {
  const { skillName, projectId, skillVersion, newLabels } = params;

  logger.info(
    `Updating skill ${skillName} in project ${projectId} version ${skillVersion} with labels ${newLabels}`,
  );
  const skillService = new SkillService(prisma, redis);

  const result = await prisma.$transaction(async (tx) => {
    const skill = (
      await tx.$queryRaw<
        Array<{
          id: string;
          name: string;
          version: number;
          labels: string[];
        }>
      >`
        SELECT
          *
        FROM
          skills
        WHERE
          project_id = ${projectId}
          AND name = ${skillName}
          AND version = ${skillVersion}
        FOR UPDATE -- Important! This will lock the row for concurrent updates
      `
    )[0];

    if (!skill) {
      throw new LangfuseNotFoundError(`Skill not found: ${skillName}`);
    }

    const newLabelsSet = new Set([...newLabels, ...skill.labels]);

    logger.info(
      `Setting labels for skill: ${skill.id}, ${skill.name}, ${skill.version}, ${JSON.stringify(
        Array.from(newLabelsSet),
      )}`,
    );

    const { updates: labelUpdates } =
      await removeLabelsFromPreviousSkillVersions({
        prisma: tx,
        projectId,
        skillName,
        labelsToRemove: [...new Set(newLabels)],
      });

    const result = await Promise.all([
      // Remove labels from other skills
      ...labelUpdates,
      // Update skill
      tx.skill.update({
        where: {
          id: skill.id,
          projectId,
        },
        data: {
          labels: {
            set: Array.from(newLabelsSet),
          },
        },
      }),
    ]);

    return result[result.length - 1];
  });

  await skillService.invalidateCache({ projectId });

  return result;
};
