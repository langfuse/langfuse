import type { NextApiRequest, NextApiResponse } from "next";

import { getSkillForApi } from "@/src/features/skills/server/skill-api-service";
import { deleteSkill } from "@/src/features/skills/server/actions/deleteSkill";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { authorizeSkillRequestOrThrow } from "../utils/authorizeSkillRequest";
import {
  GetSkillByNameSchema,
  LangfuseNotFoundError,
  PRODUCTION_LABEL,
} from "@langfuse/shared";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { prisma } from "@langfuse/shared/src/db";

const getSkillNameHandler = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  const authCheck = await authorizeSkillRequestOrThrow(req);

  const rateLimitCheck = await RateLimitService.getInstance().rateLimitRequest(
    authCheck.scope,
    "skills",
  );

  if (rateLimitCheck?.isRateLimited()) {
    return rateLimitCheck.sendRestResponseIfLimited(res);
  }

  const { skillName, version, label } = GetSkillByNameSchema.parse(req.query);

  const skill = await getSkillForApi({
    skillName,
    projectId: authCheck.scope.projectId,
    version,
    label,
  });

  if (!skill) {
    let errorMessage = `Skill not found: '${skillName}'`;

    if (version) {
      errorMessage += ` with version ${version}`;
    } else {
      errorMessage += ` with label '${label ?? PRODUCTION_LABEL}'`;
    }

    throw new LangfuseNotFoundError(errorMessage);
  }

  res.status(200).json(skill);
};

const deleteSkillNameHandler = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  const authCheck = await authorizeSkillRequestOrThrow(req);

  const rateLimitCheck = await RateLimitService.getInstance().rateLimitRequest(
    authCheck.scope,
    "skills",
  );

  if (rateLimitCheck?.isRateLimited()) {
    return rateLimitCheck.sendRestResponseIfLimited(res);
  }

  const { skillName, version, label } = GetSkillByNameSchema.parse(req.query);

  // Fetch skills for audit logging
  const where = {
    projectId: authCheck.scope.projectId,
    name: skillName,
    ...(version ? { version } : {}),
    ...(label ? { labels: { has: label } } : {}),
  };

  const skills = await prisma.skill.findMany({ where });

  // Audit log before deletion
  for (const skill of skills) {
    await auditLog({
      action: "delete",
      resourceType: "skill",
      resourceId: skill.id,
      projectId: authCheck.scope.projectId,
      orgId: authCheck.scope.orgId,
      apiKeyId: authCheck.scope.apiKeyId,
      before: skill,
    });
  }

  // Delete skill versions
  await deleteSkill({
    skillName,
    projectId: authCheck.scope.projectId,
    version,
    label,
    skillVersions: skills,
  });

  res.status(204).end();
};

export const skillNameHandler = withMiddlewares({
  GET: getSkillNameHandler,
  DELETE: deleteSkillNameHandler,
});
