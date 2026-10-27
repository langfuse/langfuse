import type { discoverFileSkills } from "../utils/archive-import";

export type DiscoveredSkill = ReturnType<typeof discoverFileSkills>[number];
export type ComparedSkill = DiscoveredSkill & {
  exists: boolean;
  hasChanges: boolean;
};
export type SkillImportDiscovery = {
  skills: DiscoveredSkill[];
  source: "local";
  commitMessage: string;
};
export type SkillImportSourceProps = {
  busy: boolean;
  onScan: (load: () => Promise<SkillImportDiscovery>) => Promise<void>;
  onReset: () => void;
};
