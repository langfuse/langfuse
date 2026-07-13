import { v4 as uuidv4 } from "uuid";
import {
  InvalidRequestError,
  jsonSchema,
  type CreateSkillTRPCType,
  LATEST_SKILL_LABEL,
} from "@langfuse/shared";
import {
  type PrismaClient,
  type Skill,
  type Prisma,
} from "@langfuse/shared/src/db";
import { removeLabelsFromPreviousSkillVersions } from "@/src/features/skills/server/utils/updateSkillLabels";
import { updateSkillTagsOnAllVersions } from "@/src/features/skills/server/utils/updateSkillTags";
import {
  SkillService,
  escapeSqlLikePattern,
  redis,
} from "@langfuse/shared/src/server";

export type CreateSkillParams = CreateSkillTRPCType & {
  createdBy: string;
  prisma: PrismaClient;
};

type DuplicateSkillParams = {
  projectId: string;
  skillId: string;
  name: string;
  isSingleVersion: boolean;
  createdBy: string;
  prisma: PrismaClient;
};

type DuplicateFolderParams = {
  projectId: string;
  sourcePath: string;
  targetPath: string;
  isSingleVersion: boolean;
  createdBy: string;
  prisma: PrismaClient;
};

export const createSkill = async ({
  projectId,
  name,
  description,
  instructions,
  metadata,
  allowedTools,
  labels = [],
  createdBy,
  prisma,
  tags,
  commitMessage,
}: CreateSkillParams) => {
  const latestSkill = await prisma.skill.findFirst({
    where: { projectId, name },
    orderBy: [{ version: "desc" }],
  });

  const finalLabels = [...labels, LATEST_SKILL_LABEL]; // Newly created skills are always labeled as 'latest'

  // If tags are undefined, use the tags from the latest skill version
  const finalTags = [...new Set(tags ?? latestSkill?.tags ?? [])];
  const newSkillId = uuidv4();

  const skillService = new SkillService(prisma, redis);
  const touchedSkillIds: string[] = [];

  const create: Prisma.PrismaPromise<Skill>[] = [
    prisma.skill.create({
      data: {
        id: newSkillId,
        name,
        description,
        instructions,
        metadata: jsonSchema.parse(metadata ?? {}),
        allowedTools: allowedTools ?? [],
        createdBy,
        labels: [...new Set(finalLabels)], // Ensure labels are unique
        tags: finalTags,
        version: latestSkill?.version ? latestSkill.version + 1 : 1,
        project: { connect: { id: projectId } },
        commitMessage,
      },
    }),
  ];

  if (finalLabels.length > 0) {
    // If we're creating a new labeled skill, we must remove those labels on previous skills since labels are unique
    const {
      touchedSkillIds: touchedSkillIdsPrevSkills,
      updates: updatesPrevSkills,
    } = await removeLabelsFromPreviousSkillVersions({
      prisma,
      projectId,
      skillName: name,
      labelsToRemove: finalLabels,
    });
    touchedSkillIds.push(...touchedSkillIdsPrevSkills);
    create.push(...updatesPrevSkills);
  }

  const haveTagsChanged =
    JSON.stringify([...new Set(finalTags)].sort()) !==
    JSON.stringify([...new Set(latestSkill?.tags)].sort());
  if (haveTagsChanged) {
    // If we're creating a new skill with tags, we must update those tags on previous skills since tags are consistent across versions
    const { touchedSkillIds: touchedSkillIdsTags, updates: updatesTags } =
      await updateSkillTagsOnAllVersions({
        prisma,
        projectId,
        skillName: name,
        tags: finalTags,
      });
    touchedSkillIds.push(...touchedSkillIdsTags);
    create.push(...updatesTags);
  }

  // Create skill and update previous skill versions
  const [createdSkill] = await prisma.$transaction(create);

  // Rotate cache epoch only after successful commit.
  await skillService.invalidateCache({ projectId });

  return createdSkill;
};

export const duplicateSkill = async ({
  projectId,
  skillId,
  name,
  isSingleVersion,
  createdBy,
  prisma,
}: DuplicateSkillParams) => {
  // validate that name is unique in project, uniqueness constraint too permissive as it includes version
  const skillNameExists = await prisma.skill.findFirst({
    where: {
      projectId,
      name,
    },
  });

  if (skillNameExists) {
    throw new InvalidRequestError(
      `Skill name ${name} already exists in project ${projectId}`,
    );
  }

  const existingSkill = await prisma.skill.findUnique({
    where: {
      id: skillId,
      projectId: projectId,
    },
  });

  if (!existingSkill) {
    throw new InvalidRequestError(`Existing skill not found: ${skillId}`);
  }

  // if defined as single version, duplicate current skill as new skill v1
  // else duplicate the entire skill, should be all or nothing operation.
  const skillsDb = await prisma.skill.findMany({
    where: {
      projectId: projectId,
      name: existingSkill.name,
      version: isSingleVersion ? existingSkill.version : undefined,
    },
  });

  // prepare createMany skill records
  const skillsToCreate = skillsDb.map((skill) => ({
    id: uuidv4(),
    name,
    version: isSingleVersion ? 1 : skill.version,
    labels: isSingleVersion
      ? [...new Set([LATEST_SKILL_LABEL, ...skill.labels])]
      : skill.labels,
    description: skill.description,
    instructions: skill.instructions,
    metadata: jsonSchema.parse(skill.metadata),
    allowedTools: skill.allowedTools,
    tags: skill.tags,
    projectId,
    createdBy,
    commitMessage: skill.commitMessage,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  // Create all skills in a single operation
  await prisma.skill.createMany({
    data: skillsToCreate,
  });

  const skillService = new SkillService(prisma, redis);
  await skillService.invalidateCache({ projectId });

  // Fetch the created skill to return
  const createdSkill = await prisma.skill.findUnique({
    where: {
      projectId_name_version: {
        projectId,
        name,
        version: isSingleVersion ? 1 : existingSkill.version,
      },
    },
  });

  return createdSkill;
};

export const duplicateFolder = async ({
  projectId,
  sourcePath,
  targetPath,
  isSingleVersion,
  createdBy,
  prisma,
}: DuplicateFolderParams) => {
  const escapedTargetPath = escapeSqlLikePattern(targetPath);
  const escapedSourcePath = escapeSqlLikePattern(sourcePath);

  const existingTargetSkill = await prisma.skill.findFirst({
    where: {
      projectId,
      name: { startsWith: `${escapedTargetPath}/` },
    },
  });

  if (existingTargetSkill) {
    throw new InvalidRequestError(
      `Skills already exist under the target path "${targetPath}/". Please choose a different target path.`,
    );
  }

  // Find all skills under the source folder, including nested subfolders
  const sourceSkills = await prisma.skill.findMany({
    where: {
      projectId,
      name: { startsWith: `${escapedSourcePath}/` },
    },
    orderBy: [{ name: "asc" }, { version: "asc" }],
  });

  if (sourceSkills.length === 0) {
    throw new InvalidRequestError(
      `No skills found under the source path "${sourcePath}/".`,
    );
  }

  // Group by name: each unique skill name may have multiple versions
  const skillsByName = new Map<string, (typeof sourceSkills)[number][]>();
  for (const skill of sourceSkills) {
    const existing = skillsByName.get(skill.name) ?? [];
    existing.push(skill);
    skillsByName.set(skill.name, existing);
  }

  const duplicatedSkillNames = new Map(
    [...skillsByName.keys()].map((originalName) => [
      originalName,
      `${targetPath}${originalName.slice(sourcePath.length)}`,
    ]),
  );
  const allSkillsToCreate: Array<{
    id: string;
    name: string;
    version: number;
    labels: string[];
    description: string;
    instructions: string;
    metadata: ReturnType<typeof jsonSchema.parse>;
    allowedTools: string[];
    tags: string[];
    projectId: string;
    createdBy: string;
    commitMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
  }> = [];

  for (const [originalName, versions] of skillsByName) {
    const latestVersion =
      versions.find((version) => version.labels.includes(LATEST_SKILL_LABEL)) ??
      versions.reduce((a, b) => (a.version > b.version ? a : b));

    const newName =
      duplicatedSkillNames.get(originalName) ??
      `${targetPath}${originalName.slice(sourcePath.length)}`;

    const skillsToCopy = isSingleVersion ? [latestVersion] : versions;

    for (const skill of skillsToCopy) {
      allSkillsToCreate.push({
        id: uuidv4(),
        name: newName,
        version: isSingleVersion ? 1 : skill.version,
        labels: isSingleVersion
          ? [...new Set([LATEST_SKILL_LABEL, ...skill.labels])]
          : skill.labels,
        description: skill.description,
        instructions: skill.instructions,
        metadata: jsonSchema.parse(skill.metadata),
        allowedTools: skill.allowedTools,
        tags: skill.tags,
        projectId,
        createdBy,
        commitMessage: skill.commitMessage,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  await prisma.skill.createMany({
    data: allSkillsToCreate,
  });

  const skillService = new SkillService(prisma, redis);
  await skillService.invalidateCache({ projectId });

  return {
    copiedSkillNames: [...duplicatedSkillNames.values()],
    copiedCount: allSkillsToCreate.length,
  };
};
