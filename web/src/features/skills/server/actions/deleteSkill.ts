import { InvalidRequestError, LangfuseNotFoundError } from "@langfuse/shared";
import { prisma, type Skill } from "@langfuse/shared/src/db";
import { SkillService, redis } from "@langfuse/shared/src/server";
import { LATEST_SKILL_LABEL } from "@langfuse/shared";

export type DeleteSkillParams = {
  skillName: string;
  projectId: string;
  version?: number | null;
  label?: string;
  skillVersions: Skill[];
};

export const deleteSkill = async (params: DeleteSkillParams) => {
  const { skillName, projectId, version, label, skillVersions } = params;

  if (version && label) {
    throw new InvalidRequestError("Cannot specify both version and label");
  }

  if (skillVersions.length === 0) {
    throw new LangfuseNotFoundError("Skill not found");
  }

  // Get all existing versions to check which labels will cease to exist
  const allVersions = await prisma.skill.findMany({
    where: { projectId, name: skillName },
    select: { id: true, version: true, labels: true },
  });

  const versionIdsBeingDeleted = new Set(skillVersions.map((s) => s.id));

  const remainingVersions = allVersions.filter(
    (v) => !versionIdsBeingDeleted.has(v.id),
  );

  const skillService = new SkillService(prisma, redis);

  const deletingLatest = skillVersions.some((s) =>
    s.labels.includes(LATEST_SKILL_LABEL),
  );
  const latestRemainsAfterDeletion = remainingVersions.some((v) =>
    v.labels.includes(LATEST_SKILL_LABEL),
  );

  // Reattach "latest" to the highest remaining version and delete the target
  // versions atomically, so a concurrent delete cannot interleave between the
  // relabel and the delete and leave the skill without a "latest" label.
  await prisma.$transaction(async (tx) => {
    if (
      deletingLatest &&
      !latestRemainsAfterDeletion &&
      remainingVersions.length > 0
    ) {
      const highestRemainingVersion = remainingVersions.reduce((max, v) =>
        v.version > max.version ? v : max,
      );

      await tx.skill.update({
        where: { id: highestRemainingVersion.id },
        data: {
          labels: [
            ...new Set([...highestRemainingVersion.labels, LATEST_SKILL_LABEL]),
          ],
        },
      });
    }

    await tx.skill.deleteMany({
      where: { projectId, id: { in: skillVersions.map((s) => s.id) } },
    });
  });

  // Rotate cache epoch only after successful commit.
  await skillService.invalidateCache({ projectId });
};
