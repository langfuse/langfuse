import type { McpFeatureModule } from "../registry";
import {
  createSkillVersionTool,
  handleCreateSkillVersion,
} from "./tools/createSkillVersion";
import { getSkillTool, handleGetSkill } from "./tools/getSkill";
import { listSkillsTool, handleListSkills } from "./tools/listSkills";
import { loadSkillTool, handleLoadSkill } from "./tools/loadSkill";
import {
  updateSkillLabelsTool,
  handleUpdateSkillLabels,
} from "./tools/updateSkillLabels";
import {
  loadSkillResourceTool,
  handleLoadSkillResource,
} from "./tools/loadSkillResource";

export const skillsFeature = {
  name: "skills",
  description:
    "Create skill versions, update labels, list skills, retrieve manifests, and load text resources",
  tools: [
    { definition: listSkillsTool, handler: handleListSkills },
    { definition: getSkillTool, handler: handleGetSkill },
    { definition: loadSkillTool, handler: handleLoadSkill },
    { definition: loadSkillResourceTool, handler: handleLoadSkillResource },
    { definition: createSkillVersionTool, handler: handleCreateSkillVersion },
    { definition: updateSkillLabelsTool, handler: handleUpdateSkillLabels },
  ],
} as const satisfies McpFeatureModule;
