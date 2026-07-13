import { type Skill } from "../../../db";

export type SkillResult = Skill;

export type SkillParams = {
  projectId: string;
  skillName: string;
} & (
  | { version: number; label: undefined }
  | { version: null | undefined; label: string }
);

export enum SkillServiceMetrics {
  SkillCacheHit = "skill_cache_hit",
  SkillCacheMiss = "skill_cache_miss",
}
