import {
  readSkillInIndex,
  searchSkillInIndex,
  type SkillReadResult,
  type SkillSearchInput,
  type SkillSearchResult,
} from "./runtime";
import { loadSkill, type LangfuseSkillId } from "./generated/skill-loaders";
import { SKILL_SEARCH_INDEX } from "./generated/search-index";

export type {
  LangfuseSkillId,
  SkillReadResult,
  SkillSearchInput,
  SkillSearchResult,
};
export { isLangfuseSkillId } from "./generated/skill-loaders";

export type SkillReadInput = {
  id: LangfuseSkillId;
};

export async function searchSkill(
  input: SkillSearchInput,
): Promise<SkillSearchResult[]> {
  return searchSkillInIndex({ ...input, index: SKILL_SEARCH_INDEX });
}

export async function readSkill(
  input: SkillReadInput,
): Promise<SkillReadResult> {
  const skill = await loadSkill(input.id);
  return readSkillInIndex({ ...input, skill });
}
