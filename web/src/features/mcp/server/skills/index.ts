import type { McpFeatureModule } from "../registry";
import { getSkillTool, handleGetSkill } from "./tools/getSkill";
import { listSkillsTool, handleListSkills } from "./tools/listSkills";
import { loadSkillTool, handleLoadSkill } from "./tools/loadSkill";

export const skillsFeature = {
  name: "skills",
  description: "List skills, retrieve version manifests, and load instructions",
  tools: [
    { definition: listSkillsTool, handler: handleListSkills },
    { definition: getSkillTool, handler: handleGetSkill },
    { definition: loadSkillTool, handler: handleLoadSkill },
  ],
} as const satisfies McpFeatureModule;
