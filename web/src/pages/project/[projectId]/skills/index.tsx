import { SkillsPage } from "@/src/features/skills/components/SkillsPage";
import { SkillsFeatureGate } from "@/src/features/skills/components/SkillsFeatureGate";

export default function Skills() {
  return (
    <SkillsFeatureGate>
      <SkillsPage />
    </SkillsFeatureGate>
  );
}
