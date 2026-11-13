import {
  MAX_SKILLS_PER_OBSERVATION,
  type SkillsAvailable,
  type SkillsAvailableInput,
  type SkillsResourceLoaded,
} from "@langfuse/shared";
import { logger, type SkillCacheService } from "@langfuse/shared/src/server";

/** Resolve skill names/versions to project skill IDs for the storage row. */
export async function resolveSkillReferences({
  projectId,
  type,
  service,
  available = [],
  loaded = [],
}: {
  projectId: string;
  type: string;
  service: SkillCacheService;
  available?: SkillsAvailableInput;
  loaded?: SkillsResourceLoaded;
}): Promise<{
  skills_available: SkillsAvailable;
  skills_resource_loaded: SkillsResourceLoaded;
}> {
  if (
    available.length > MAX_SKILLS_PER_OBSERVATION ||
    loaded.length > MAX_SKILLS_PER_OBSERVATION
  ) {
    logger.warn("Skill references truncated: item limit exceeded", {
      projectId,
      availableCount: available.length,
      loadedCount: loaded.length,
      limit: MAX_SKILLS_PER_OBSERVATION,
    });
  }
  available = available.slice(0, MAX_SKILLS_PER_OBSERVATION);
  loaded = loaded.slice(0, MAX_SKILLS_PER_OBSERVATION);
  const versions = available.flatMap(({ name, version }) =>
    version == null ? [] : [{ name, version }],
  );
  const skills = await service.getReferences({ projectId, versions });

  const availableSkills = available.map(({ name, version }) => {
    const skill = skills.find(
      (skill) => skill.name === name && skill.version === version,
    );
    return {
      name,
      version: skill?.version ?? version,
      langfuseSkillId: skill?.id,
    };
  });

  const loadedResources = loaded.map(
    ({ skillName, filePath, skillVersion }) => {
      const candidates = availableSkills.filter(
        (skill) => skill.name === skillName,
      );
      if (candidates.length !== 1) return { skillName, filePath, skillVersion };

      const skill = candidates[0];
      return {
        skillName,
        filePath,
        langfuseSkillId: skill.langfuseSkillId,
        skillVersion: skill.version ?? skillVersion,
      };
    },
  );

  return {
    skills_available:
      type === "GENERATION"
        ? availableSkills.map(({ name, version, langfuseSkillId }) => ({
            skillName: name,
            skillVersion: version,
            langfuseSkillId,
          }))
        : [],
    skills_resource_loaded: loadedResources,
  };
}
