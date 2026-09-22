import type { McpFeatureModule } from "../registry";
import { getSkillTool, handleGetSkill } from "./tools/getSkill";
import { getSkillFileTool, handleGetSkillFile } from "./tools/getSkillFile";
import { listSkillsTool, handleListSkills } from "./tools/listSkills";

export const skillsFeature = {
  name: "skills",
  description:
    "List skills, retrieve version manifests and download individual files",
  tools: [
    { definition: listSkillsTool, handler: handleListSkills },
    { definition: getSkillTool, handler: handleGetSkill },
    { definition: getSkillFileTool, handler: handleGetSkillFile },
  ],
} as const satisfies McpFeatureModule;
