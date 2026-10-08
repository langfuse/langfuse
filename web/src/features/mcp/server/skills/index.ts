import type { McpFeatureModule } from "../registry";
import { getSkillTool, handleGetSkill } from "./tools/getSkill";
import { listSkillsTool, handleListSkills } from "./tools/listSkills";
import { loadSkillTool, handleLoadSkill } from "./tools/loadSkill";
import {
  loadSkillResourceTool,
  handleLoadSkillResource,
} from "./tools/loadSkillResource";

export const skillsFeature = {
  name: "skills",
  description:
    "List skills, retrieve version manifests, and load text resources",
  tools: [
    { definition: listSkillsTool, handler: handleListSkills },
    { definition: getSkillTool, handler: handleGetSkill },
    { definition: loadSkillTool, handler: handleLoadSkill },
    { definition: loadSkillResourceTool, handler: handleLoadSkillResource },
  ],
} as const satisfies McpFeatureModule;
