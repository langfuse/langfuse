import type { McpFeatureModule } from "../registry";
import { getSkillTool, handleGetSkill } from "./tools/getSkill";
import { listSkillsTool, handleListSkills } from "./tools/listSkills";

export const skillsFeature = {
  name: "skills",
  description: "List skills and retrieve version manifests",
  tools: [
    { definition: listSkillsTool, handler: handleListSkills },
    { definition: getSkillTool, handler: handleGetSkill },
  ],
} as const satisfies McpFeatureModule;
