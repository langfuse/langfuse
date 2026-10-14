import { SkillsPage } from "@/src/ai/skills/components/SkillsPage";
import { SkillsFeatureGate } from "@/src/ai/skills/components/SkillsFeatureGate";

export default function Skills() {
  return (
    <SkillsFeatureGate>
      <SkillsPage />
    </SkillsFeatureGate>
  );
}
