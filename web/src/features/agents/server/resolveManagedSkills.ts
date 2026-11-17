import { type PrismaClient } from "@langfuse/shared/src/db";
import { type AgentSkillRow } from "@langfuse/shared/agents";

/** Resolve only exact, project-owned versions; observed names alone are not catalog references. */
export async function resolveManagedSkills(
  prisma: PrismaClient,
  projectId: string,
  rows: AgentSkillRow[],
) {
  const references = rows.flatMap(({ skillId, skillVersion }) =>
    skillId !== null && skillVersion !== null
      ? [{ id: skillId, version: skillVersion }]
      : [],
  );
  const versions =
    references.length > 0
      ? await prisma.skill.findMany({
          where: { projectId, OR: references },
          select: { id: true, name: true, version: true },
        })
      : [];
  const byId = new Map(versions.map((skill) => [skill.id, skill]));
  return rows.map((row) => {
    const skill = row.skillId ? byId.get(row.skillId) : undefined;
    const managedSkill =
      skill?.version === row.skillVersion
        ? { name: skill.name, version: skill.version }
        : null;
    return { ...row, managedSkill };
  });
}
