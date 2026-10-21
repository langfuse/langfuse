import {
  SKILL_LATEST_LABEL,
  SKILL_PRODUCTION_LABEL,
  type SkillSelector,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";

export async function resolveSkillSelector({
  projectId,
  name,
  selector,
}: {
  projectId: string;
  name: string;
  selector: SkillSelector;
}): Promise<SkillSelector> {
  if (selector.version !== undefined || selector.label !== undefined) {
    return selector;
  }

  const production = await prisma.skill.findFirst({
    where: { projectId, name, labels: { has: SKILL_PRODUCTION_LABEL } },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  return production ?? { label: SKILL_LATEST_LABEL };
}
