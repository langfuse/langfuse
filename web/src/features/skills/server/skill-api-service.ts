import { prisma } from "@langfuse/shared/src/db";
import type {
  CreateSkillSchema,
  GetSkillByNameSchema,
  GetSkillsMetaSchema,
  Skill,
} from "@langfuse/shared";
import { InvalidRequestError, LangfuseNotFoundError } from "@langfuse/shared";
import type { z } from "zod";

import { auditLog } from "@/src/features/audit-logs/auditLog";
import { createSkill } from "./actions/createSkill";
import { getSkillByName } from "./actions/getSkillByName";
import { getSkillsMeta } from "./actions/getSkillsMeta";
import { updateSkill } from "./actions/updateSkills";

type ApiKeyProjectContext = {
  projectId: string;
  orgId: string;
  apiKeyId: string;
};

type ListSkillsForApiInput = z.infer<typeof GetSkillsMetaSchema> & {
  projectId: string;
};

type GetSkillForApiInput = z.infer<typeof GetSkillByNameSchema> & {
  projectId: string;
};

export const listSkillsForApi = async (input: ListSkillsForApiInput) => {
  return await getSkillsMeta(input);
};

export const getSkillForApi = async (input: GetSkillForApiInput) => {
  return await getSkillByName({
    skillName: input.skillName,
    projectId: input.projectId,
    version: input.version,
    label: input.label,
  });
};

export const createSkillForApi = async ({
  context,
  input,
}: {
  context: ApiKeyProjectContext;
  input: z.infer<typeof CreateSkillSchema>;
}) => {
  const createdSkill = await createSkill({
    ...input,
    metadata: input.metadata ?? {},
    projectId: context.projectId,
    createdBy: "API",
    prisma,
  }).catch((err) => {
    if (
      typeof err === "object" &&
      err?.constructor.name === "PrismaClientKnownRequestError" &&
      "code" in err &&
      // Unique constraint failed: https://www.prisma.io/docs/orm/reference/error-reference#p2002
      err.code === "P2002"
    ) {
      throw new InvalidRequestError(
        `Failed to create skill '${input.name}' due to unique constraint failure. This is likely due to too many concurrent skill creations for this skill name. Please add a delay.`,
      );
    }

    throw err;
  });

  await auditLog({
    action: "create",
    resourceType: "skill",
    resourceId: createdSkill.id,
    projectId: context.projectId,
    orgId: context.orgId,
    apiKeyId: context.apiKeyId,
    after: createdSkill,
  });

  return createdSkill;
};

export const updateSkillLabelsForApi = async ({
  context,
  skillName,
  skillVersion,
  newLabels,
}: {
  context: ApiKeyProjectContext;
  skillName: string;
  skillVersion: number;
  newLabels: string[];
}) => {
  const existingSkill = await prisma.skill.findUnique({
    where: {
      projectId_name_version: {
        projectId: context.projectId,
        name: skillName,
        version: skillVersion,
      },
    },
  });

  if (!existingSkill) {
    throw new LangfuseNotFoundError(
      `Skill '${skillName}' version ${skillVersion} not found in project`,
    );
  }

  const updatedSkill = await updateSkill({
    skillName,
    projectId: context.projectId,
    skillVersion,
    newLabels,
  });

  await auditLog({
    action: "update",
    resourceType: "skill",
    resourceId: updatedSkill.id,
    projectId: context.projectId,
    orgId: context.orgId,
    apiKeyId: context.apiKeyId,
    before: existingSkill ?? undefined,
    after: updatedSkill,
  });

  return { existingSkill, updatedSkill } satisfies {
    existingSkill: Skill;
    updatedSkill: Skill;
  };
};
