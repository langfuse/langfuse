import { LATEST_SKILL_LABEL, PRODUCTION_LABEL } from "@langfuse/shared";

export const isReservedSkillLabel = (label: string) => {
  return [PRODUCTION_LABEL, LATEST_SKILL_LABEL].includes(label);
};
