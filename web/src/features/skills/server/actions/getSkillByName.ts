import { InvalidRequestError, PRODUCTION_LABEL } from "@langfuse/shared";
import {
  SkillService,
  redis,
  recordIncrement,
} from "@langfuse/shared/src/server";
import { prisma, type Skill } from "@langfuse/shared/src/db";

type GetSkillByNameParams = {
  skillName: string;
  projectId: string;
  version?: number | null;
  label?: string;
};

export const getSkillByName = async (
  params: GetSkillByNameParams,
): Promise<Skill | null> => {
  const { skillName, projectId, version, label } = params;

  if (version && label)
    throw new InvalidRequestError("Cannot specify both version and label");

  const skillService = new SkillService(prisma, redis, recordIncrement);

  if (version)
    return skillService.getSkill({
      projectId,
      skillName,
      version,
      label: undefined,
    });

  if (label)
    return skillService.getSkill({
      projectId,
      skillName,
      label,
      version: undefined,
    });

  return skillService.getSkill({
    projectId,
    skillName,
    label: PRODUCTION_LABEL,
    version: undefined,
  });
};
